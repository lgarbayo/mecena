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
import { designTokens } from "./design";
import { isDossierStyle } from "./style";
import { currentDesign, ensureDesign } from "./designs";
import type { PdfTokens } from "./pdf/DossierPdf";
import type { PdfFaces } from "./pdf/fonts";

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
export async function buildDossier(input: { profileId: string; callId?: string; ai?: boolean }): Promise<Dossier> {
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
  // What goes to a call is only what the artist confirmed: unreviewed sheets never count or appear.
  const plan = planVariant({ works: pdfWorks(works), call, profile, imageBytes: await imageSizer() });
  if (input.ai === false) return { ...base, workIds: plan.workIds, variant: plan.variant };
  const kept = orderWorks(works, plan.workIds);
  const adaptation = await adaptVariant({ profile, call, sections: base.sections, works: kept });
  return { ...base, workIds: plan.workIds, variant: { ...plan.variant, ...adaptation } };
}

/** Everything the page and the PDF need. `adapt: false` keeps the plain ordering but still returns the notes. */
export async function loadDossierData(input: { profileId: string; callId?: string; adapt?: boolean }): Promise<DossierData> {
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

/** What a render did to fit the call's file-size limit (read with `pdfReport`). */
export interface PdfSize {
  bytes: number;
  maxFileMb?: number;
  /** Photos were downscaled to REDUCED_EDGE px for this call version (only when the full one was over). */
  reduced: boolean;
  /** Bytes of the first render, when it had to be reduced. */
  fullBytes?: number;
}
const PDF_SIZES = new WeakMap<Buffer, PdfSize>();

/** Only confirmed works go into the PDF: a sheet the artist has not reviewed is not theirs yet. */
export function pdfWorks(works: Work[]): Work[] {
  return works.filter((w) => w.confirmed !== false);
}

/** The file-size limit of the call this dossier is adapted to, in MB (none for the plain dossier). */
export function pdfLimitMb(data: DossierData): number | undefined {
  return data.dossier.variant ? (data.dossier.variant.maxFileMb ?? data.call?.dossierRequirements?.maxFileMb) : undefined;
}

/** Test seam: lets tests force the renderer to throw. */
export const pdfRenderer = {
  async render(data: DossierData, tokens?: PdfTokens, faces?: PdfFaces): Promise<Buffer> {
    const [{ renderToBuffer }, { DossierPdf }, { loadPdfImage }, { framePdfImage, REDUCED_EDGE }, { createElement }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("./pdf/DossierPdf"),
      import("./pdf/images"),
      import("./pdf/crop"),
      import("react"),
    ]);
    const works = pdfWorks(data.works);
    const view = dossierView({ ...data, works });
    const once = async (maxEdge?: number) => {
      // Keyed by work: the same photo may carry a different crop in two works. The crop is applied to an
      // in-memory copy; the upload on disk stays the untouched original.
      const images = Object.fromEntries(
        await Promise.all(
          works.map(async (w) => {
            const img = loadPdfImage(w.imageUrl);
            return [w.id, img ? await framePdfImage(img, w.crop, { maxEdge }) : undefined] as const;
          }),
        ),
      );
      // DossierPdf returns a <Document>; renderToBuffer's type wants the Document element itself.
      const el = createElement(DossierPdf, { view, images, tokens, faces }) as unknown as Parameters<typeof renderToBuffer>[0];
      return renderToBuffer(el);
    };
    const maxFileMb = pdfLimitMb(data);
    const full = await once();
    if (maxFileMb === undefined || full.length <= maxFileMb * 1024 * 1024) {
      PDF_SIZES.set(full, { bytes: full.length, maxFileMb, reduced: false });
      return full;
    }
    // Over the call's limit: the call version gets lighter photos (the plain dossier never changes).
    const small = await once(REDUCED_EDGE);
    PDF_SIZES.set(small, { bytes: small.length, maxFileMb, reduced: true, fullBytes: full.length });
    return small;
  },
};

/** Size facts of a PDF this module rendered (the fallback PDF has none). */
export function pdfReport(bytes: Buffer): PdfSize {
  return PDF_SIZES.get(bytes) ?? { bytes: bytes.length, reduced: false };
}

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1).replace(".", ",");

/** Plain Spanish note on the real PDF size against the call's limit, or undefined when there is no limit. */
export function pdfSizeNote(size: PdfSize): string | undefined {
  if (size.maxFileMb === undefined) return undefined;
  const limit = String(size.maxFileMb).replace(".", ",");
  if (size.bytes > size.maxFileMb * 1024 * 1024)
    return `El PDF pesa ${mb(size.bytes)} MB y la convocatoria admite ${limit} MB, incluso con las fotos reducidas: quita alguna obra antes de presentarlo.`;
  if (size.reduced && size.fullBytes)
    return `El PDF completo pesaba ${mb(size.fullBytes)} MB y la convocatoria admite ${limit} MB: para esta versión hemos reducido las fotos a ${1200} px. Ahora pesa ${mb(size.bytes)} MB.`;
  return `El PDF pesa ${mb(size.bytes)} MB: dentro del límite de ${limit} MB de la convocatoria.`;
}

export interface PdfLook {
  /** A starting point ("sobrio" | "editorial" | "galeria") to use instead of the saved design. */
  style?: string | null;
}

/** The design for this PDF: the one the artist made with the design agent, or the starting point that suits the call. */
export function pdfTokens(data: DossierData, look: PdfLook = {}): PdfTokens {
  return designTokens(currentDesign({ profile: data.profile, call: data.call, preset: look.style }).design);
}

/** Returns PDF bytes. Never throws for a known profile: renderer errors fall back to a minimal PDF. */
export async function renderDossierPdf(input: { profileId: string; callId?: string; adapt?: boolean } & PdfLook): Promise<Buffer> {
  const data = await loadDossierData(input);
  // No design yet (the artist never opened /dossier): design it from the interview, so the PDF honours what they asked for.
  if (!isDossierStyle(input.style)) await ensureDesign({ profileId: data.profile.id, callId: input.callId });
  try {
    const tokens = pdfTokens(data, input);
    const { loadDesignFonts } = await import("./pdf/fonts");
    const faces = await loadDesignFonts(tokens.design).catch(() => ({}));
    return await pdfRenderer.render(data, tokens, faces);
  } catch (e) {
    console.error("[dossier] PDF renderer failed, serving the fallback PDF", e);
    return renderFallbackPdf(data.profile.displayName);
  }
}

export async function exportDossierPdf(input: { profileId: string; callId?: string }): Promise<{ url: string; filePath: string; pages?: number; sizeMb?: number; note?: string }> {
  const profile = getProfile(input.profileId);
  const bytes = await renderDossierPdf({ ...input, profileId: profile.id });
  const filePath = path.join(exportsDir(), `dossier-${profile.id}${input.callId ? `-${input.callId}` : ""}.pdf`);
  fs.writeFileSync(filePath, bytes);
  const size = pdfReport(bytes);
  return { url: pdfUrl(profile.id, input.callId), filePath, pages: countPages(bytes), sizeMb: Math.round((bytes.length / (1024 * 1024)) * 100) / 100, note: pdfSizeNote(size) };
}

/**
 * The artist's own photos as files, for calls that want loose images instead of a PDF: the untouched originals
 * (no crop, no re-encoding), confirmed works only, in the call's order and limit when there is a call.
 */
export async function dossierImages(input: { profileId: string; callId?: string }): Promise<{ name: string; data: Buffer; mediaType: string }[]> {
  const profile = getProfile(input.profileId);
  const all = pdfWorks(sortWorks(listWorks(profile.id)));
  const ids = input.callId ? (await buildDossier({ profileId: profile.id, callId: input.callId, ai: false })).workIds : all.map((w) => w.id);
  const { readImageBytes, sniff } = await import("./pdf/images");
  const { imageFileName } = await import("./images");
  const out: { name: string; data: Buffer; mediaType: string }[] = [];
  for (const w of orderWorks(all, ids)) {
    const data = readImageBytes(w.imageUrl);
    if (!data) continue;
    const format = sniff(data);
    const webp = data.subarray(8, 12).toString("latin1") === "WEBP";
    const ext = format === "png" ? "png" : format === "jpg" ? "jpg" : webp ? "webp" : undefined;
    if (!ext) continue;
    out.push({ name: imageFileName(profile.displayName, w, ext, out.length + 1), data, mediaType: ext === "jpg" ? "image/jpeg" : `image/${ext}` });
  }
  return out;
}
