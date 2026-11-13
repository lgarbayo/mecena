// STUB (scaffold, working baseline). Owned by WP-03: real templates, call variants and @react-pdf/renderer PDF.
import fs from "node:fs";
import path from "node:path";
import type { Dossier } from "@/contracts";
import { serverEnv } from "@/contracts";
import { exportsDir, getCall, getDossier, getProfile, listWorks, nowIso } from "@/server/store";

export async function buildDossier(input: { profileId?: string; callId?: string }): Promise<Dossier> {
  const profile = getProfile(input.profileId);
  const saved = getDossier(profile.id);
  const works = listWorks(profile.id);
  const call = input.callId ? getCall(input.callId) : undefined;
  const max = call?.dossierRequirements?.maxImages;
  return {
    profileId: profile.id,
    kind: profile.kind,
    sections: saved?.sections ?? [],
    workIds: works.map((w) => w.id).slice(0, max ?? works.length),
    variant: call ? { callId: call.id, notes: [], maxImages: max, maxFileMb: call.dossierRequirements?.maxFileMb } : undefined,
    generatedAt: nowIso(),
  };
}

export function dossierUrl(profileId: string, callId?: string): string {
  const q = new URLSearchParams({ profileId, ...(callId ? { callId } : {}) });
  return `${serverEnv().publicUrl}/dossier?${q}`;
}

/** Returns PDF bytes. Stub: a valid one-page PDF with the name only. */
export async function renderDossierPdf(input: { profileId?: string; callId?: string }): Promise<Buffer> {
  const profile = getProfile(input.profileId);
  const text = `Dossier - ${profile.displayName || "Mecena"}`.replace(/[()\\]/g, "");
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export async function exportDossierPdf(input: { profileId?: string; callId?: string }): Promise<{ url: string; filePath: string; pages?: number }> {
  const profile = getProfile(input.profileId);
  const bytes = await renderDossierPdf({ ...input, profileId: profile.id });
  const filePath = path.join(exportsDir(), `dossier-${profile.id}${input.callId ? `-${input.callId}` : ""}.pdf`);
  fs.writeFileSync(filePath, bytes);
  const q = new URLSearchParams({ profileId: profile.id, ...(input.callId ? { callId: input.callId } : {}) });
  return { url: `${serverEnv().publicUrl}/api/dossier/pdf?${q}`, filePath, pages: 1 };
}
