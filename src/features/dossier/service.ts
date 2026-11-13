/**
 * Dossier service (WP-03). Server-only.
 * - buildDossier: saved sections + ordered works; with callId, a derived variant (never saved over the base).
 * - renderDossierPdf: @react-pdf/renderer A4 PDF; on any renderer error, the minimal fallback PDF.
 * - exportDossierPdf: writes the PDF under exportsDir() and returns a phone-openable URL.
 */
import fs from "node:fs";
import path from "node:path";
import type { Call, Dossier, Profile, Work } from "@/contracts";
import { serverEnv } from "@/contracts";
import { exportsDir, getCall, getDossier, getProfile, listWorks, nowIso } from "@/server/store";
import { orderWorks, toDossierView, type DossierView } from "./model";
import { planVariant } from "./variant";
import { adaptVariant } from "./adapt";

export interface DossierData {
  dossier: Dossier;
  profile: Profile;
  works: Work[]; // filtered and ordered as dossier.workIds
  call?: Call;
}

function sortWorks(works: Work[]): Work[] {
  return [...works].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

/** Image size on disk (for the "your photos weigh X MB" note). Lazy import keeps model/variant free of fs. */
async function imageSizer(): Promise<(w: Work) => number | undefined> {
  const { readImageBytes } = await import("./pdf/images");
  return (w) => readImageBytes(w.imageUrl)?.length;
}

/**
 * With callId: the rules plan (order, image limits, notes) and, unless `ai: false`, the content adaptation
 * (sections rewritten for the call's criteria, cached). `ai: false` is the free preview: no model call.
 */
export async function buildDossier(input: { profileId?: string; callId?: string; ai?: boolean }): Promise<Dossier> {
  const profile = getProfile(input.profileId);
  const saved = getDossier(profile.id);
  const works = sortWorks(listWorks(profile.id));
  const base: Dossier = {
    profileId: profile.id,
    kind: profile.kind,
    sections: saved?.sections ?? [],
    workIds: works.map((w) => w.id),
    generatedAt: nowIso(),
  };
  if (!input.callId) return base;
  const call = getCall(input.callId);
  const plan = planVariant({ works, call, profile, imageBytes: await imageSizer() });
  if (input.ai === false) return { ...base, workIds: plan.workIds, variant: plan.variant };
  const kept = orderWorks(works, plan.workIds);
  const adaptation = await adaptVariant({ profile, call, sections: base.sections, works: kept });
  return { ...base, workIds: plan.workIds, variant: { ...plan.variant, ...adaptation } };
}

/** Everything the page and the PDF need. `adapt: false` keeps the plain ordering but still returns the notes. */
export async function loadDossierData(input: { profileId?: string; callId?: string; adapt?: boolean }): Promise<DossierData> {
  const dossier = await buildDossier({ ...input, ai: input.adapt !== false });
  const profile = getProfile(dossier.profileId);
  const all = listWorks(profile.id);
  const call = input.callId ? getCall(input.callId) : undefined;
  if (input.callId && input.adapt === false) {
    const plain = await buildDossier({ profileId: profile.id });
    const out = { ...plain, variant: dossier.variant };
    return { dossier: out, profile, works: orderWorks(all, out.workIds), call };
  }
  return { dossier, profile, works: orderWorks(all, dossier.workIds), call };
}

export function dossierView(data: DossierData): DossierView {
  return toDossierView(data);
}

export function dossierUrl(profileId: string, callId?: string): string {
  const q = new URLSearchParams({ profileId, ...(callId ? { callId } : {}) });
  return `${serverEnv().publicUrl}/dossier?${q}`;
}

export function pdfUrl(profileId: string, callId?: string): string {
  const q = new URLSearchParams({ profileId, ...(callId ? { callId } : {}) });
  return `${serverEnv().publicUrl}/api/dossier/pdf?${q}`;
}

/** Count pages in a PDF we produced (pdfkit writes page dicts uncompressed). */
export function countPages(bytes: Buffer): number {
  const m = bytes.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 0;
}

/** Last resort: a valid one-page PDF with the name, so the download never 500s. */
export function renderFallbackPdf(name: string): Buffer {
  const text = `Dossier - ${name || "Mecena"}`.replace(/[()\\]/g, "").replace(/[^\x20-\xff]/g, "?");
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Test seam: lets tests force the renderer to throw. */
export const pdfRenderer = {
  async render(data: DossierData): Promise<Buffer> {
    const [{ renderToBuffer }, { DossierPdf }, { loadPdfImage }, { createElement }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("./pdf/DossierPdf"),
      import("./pdf/images"),
      import("react"),
    ]);
    const view = dossierView(data);
    const images = Object.fromEntries(data.works.map((w) => [w.imageUrl, loadPdfImage(w.imageUrl)]));
    // DossierPdf returns a <Document>; renderToBuffer's type wants the Document element itself.
    const el = createElement(DossierPdf, { view, images }) as unknown as Parameters<typeof renderToBuffer>[0];
    return renderToBuffer(el);
  },
};

/** Returns PDF bytes. Never throws for a known profile: renderer errors fall back to a minimal PDF. */
export async function renderDossierPdf(input: { profileId?: string; callId?: string; adapt?: boolean }): Promise<Buffer> {
  const data = await loadDossierData(input);
  try {
    return await pdfRenderer.render(data);
  } catch (e) {
    console.error("[dossier] PDF renderer failed, serving the fallback PDF", e);
    return renderFallbackPdf(data.profile.displayName);
  }
}

export async function exportDossierPdf(input: { profileId?: string; callId?: string }): Promise<{ url: string; filePath: string; pages?: number }> {
  const profile = getProfile(input.profileId);
  const bytes = await renderDossierPdf({ ...input, profileId: profile.id });
  const filePath = path.join(exportsDir(), `dossier-${profile.id}${input.callId ? `-${input.callId}` : ""}.pdf`);
  fs.writeFileSync(filePath, bytes);
  return { url: pdfUrl(profile.id, input.callId), filePath, pages: countPages(bytes) };
}
