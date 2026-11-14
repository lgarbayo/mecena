/**
 * Import the user's existing dossier (CCR-8) instead of (or before) talking: a PDF, a photo of it, or pasted text.
 * Claude reads it natively (PDF document block / vision) and returns the same shape as an onboarding turn:
 * profile patch + dossier sections, copied from the document (not rewritten) so the user's own words survive, with
 * typos, spelling and OCR slips corrected by Claude (WORDING_RULE): their words, not their errata.
 * Each imported section is also stored as a transcript segment (source "text"), so drafting, the call variant and
 * the jury can cite it exactly like spoken words. The original file is kept under uploads/.
 * Feature-local real/mock pair (no AiService change): without AI only pasted text can be imported.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { DossierSection, Profile, ProfileKind, ProfilePatch } from "@/contracts";
import type { ImportDossierRequest, ImportDossierResponse } from "@/contracts/api";
import { BusinessSectionKey, CreatorSectionKey } from "@/contracts";
import { imageBlock, isMockAi, structured, type UserContent } from "@/server/ai/llm";
import { WORDING_RULE } from "@/server/ai/wording";
import { appendSegment, getDossier, getProfile, listWorks, mergeProfile, nowIso, saveDossier, saveProfile, uploadsDir } from "@/server/store";
import { sectionTitles } from "./copy";
import { extractProfilePatch, followUpFor, mockOnboardingTurn } from "./mock";
import { cleanProfilePatch, llmTurnSchema } from "./prompt";
import { changedFields } from "./service";

export class ImportUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportUnsupportedError";
  }
}

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export function importSchema(kind: ProfileKind) {
  const key = kind === "creator" ? CreatorSectionKey : BusinessSectionKey;
  return z.object({
    profilePatch: llmTurnSchema(kind).shape.profilePatch,
    sections: z.array(
      z.object({
        key,
        body: z.string().describe("Texto de la sección COPIADO del documento, en su redacción original pero sin erratas; párrafos y viñetas '- '"),
      }),
    ),
    worksFound: z.array(z.string()).describe("Obras o proyectos que aparecen: 'Título, año, técnica, medidas' con lo que diga el documento"),
    followUpQuestion: z.string().describe("Una pregunta breve sobre lo más importante que falta para optar a convocatorias"),
  });
}
/** profilePatch already without the "not said" sentinels the schema requires (cleanProfilePatch). */
export type ImportResult = Omit<z.infer<ReturnType<typeof importSchema>>, "profilePatch"> & { profilePatch: ProfilePatch };

function system(kind: ProfileKind): string {
  const titles = Object.entries(sectionTitles(kind))
    .map(([k, t]) => `${k} (${t})`)
    .join(", ");
  const who = kind === "creator" ? "artista o creador/a" : "pyme o autónomo/a";
  const copyRule = `COPIA sus textos con su redacción (puedes quitar repeticiones y cortar lo que no sea de esa sección, pero no reescribas ni adornes), corrigiendo solo erratas, faltas de ortografía, tildes y lo que la foto o el PDF haya leído mal (letras cambiadas, palabras partidas o pegadas). Traduce al castellano solo si el documento está en otro idioma que no sea gallego; el gallego se deja en gallego (solo se corrigen sus erratas).`;
  if (kind === "business")
    return [
      `Eres Mecena. Una pyme o un/a autónomo/a te da un documento sobre su negocio (presentación, web, memoria…; PDF, foto o texto) para rellenar la ficha de su empresa y buscarle ayudas y subvenciones. No le estás haciendo un dossier.`,
      "Tu trabajo es ordenar, no escribir:",
      "- profilePatch (lo más importante): nombre del negocio, actividad con sus palabras (sector), municipio/provincia/comunidad, forma jurídica (legalForm: autonomo, sl, sa, cooperativa, asociacion u otra), plantilla total (employees), año de inicio (foundedYear), facturación anual (annualRevenueEur), clientes y proyectos (achievements), enlaces e idiomas. CNAE solo si aparece. Lo que no diga va vacío: \"\" en los textos (también legalForm), [] en las listas y 0 en los números.",
      "- Si habla de algo que quiere hacer o financiar (invertir, digitalizar, contratar, exportar, ahorrar energía, innovar), ponlo en profilePatch.projectIdea (una frase) y en fundingNeeds.",
      `- sections: la descripción de la empresa que irá en sus solicitudes, en estas secciones: ${titles}. ${copyRule}`,
      "- worksFound: devuelve [].",
      "- followUpQuestion: una pregunta breve (máx. 15 palabras) sobre lo que más falta para saber a qué ayudas puede optar (actividad, municipio, forma jurídica, plantilla o qué quiere financiar).",
      "Reglas: NUNCA inventes datos. Si una sección no aparece en el documento, no la incluyas. Castellano de España (tú) en la pregunta.",
      WORDING_RULE,
    ].join("\n");
  return [
    `Eres Mecena. Una persona (${who}) te da el dossier que ya tenía (PDF, foto o texto) para no empezar de cero.`,
    "Tu trabajo es ordenar, no escribir:",
    "- profilePatch: los datos que el documento dice (nombre, ciudad, disciplinas, formación, exposiciones, conciertos, discos, estrenos, festivales, publicaciones, premios o clientes, enlaces, idiomas, año de nacimiento o de fundación…). Lo que no diga va vacío: \"\" en los textos, [] en las listas y 0 en los números.",
    `- sections: reparte el contenido del documento en estas secciones: ${titles}. ${copyRule}`,
    "- Series, colecciones y proyectos (también los que aún va a hacer) van en su sección (series/projects) con el texto del documento. Si habla de un proyecto que quiere hacer o financiar, ponlo además en profilePatch.projectIdea (una frase) y lo que necesita en fundingNeeds.",
    "- Exposiciones, premios, publicaciones o clientes también en profilePatch.achievements; estudios en education. Disciplinas en minúscula.",
    "- La trayectoria (cv) en viñetas '- AAAA Texto. Lugar'. El contacto en viñetas.",
    "- worksFound: cada obra o proyecto que aparezca, con título y los datos de ficha que dé el documento.",
    "- followUpQuestion: una pregunta breve (máx. 15 palabras) sobre lo más útil que falta (proyecto que quiere financiar, ciudad, qué busca…).",
    "Reglas: NUNCA inventes datos. Si una sección no aparece en el documento, no la incluyas. Castellano de España (tú) en la pregunta.",
    WORDING_RULE,
  ].join("\n");
}

const warmed = new Set<ProfileKind>();
/** Compile the import schema before the user uploads (first call with a new schema is ~40 s slower). */
export function warmImportAi(kind: ProfileKind): void {
  if (warmed.has(kind) || isMockAi()) return;
  warmed.add(kind);
  structured({ tier: "fast", effort: "low", maxTokens: 300, system: system(kind), user: "{}", schema: importSchema(kind) }).catch(() => warmed.delete(kind));
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string; bytes: number } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new ImportUnsupportedError("No se ha podido leer el archivo.");
  const base64 = m[2];
  return { mediaType: m[1], base64, bytes: Math.floor((base64.length * 3) / 4) };
}

async function extractWithClaude(profile: Profile, req: ImportDossierRequest): Promise<ImportResult> {
  const content: Exclude<UserContent, string> = [];
  if (req.fileDataUrl) {
    const f = parseDataUrl(req.fileDataUrl);
    if (f.mediaType === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } });
    else content.push(imageBlock(f.base64, f.mediaType as "image/jpeg" | "image/png" | "image/webp"));
  }
  if (req.text?.trim()) content.push({ type: "text", text: `TEXTO DEL DOSSIER:\n${req.text.trim()}` });
  const { id: _i, updatedAt: _u, ...current } = profile;
  content.push({ type: "text", text: `PERFIL ACTUAL (no repitas lo que ya está): ${JSON.stringify(current)}` });
  const out = await structured({ tier: "fast", effort: "low", maxTokens: 12000, system: system(profile.kind), user: content, schema: importSchema(profile.kind) });
  return { ...out, profilePatch: cleanProfilePatch(out.profilePatch) };
}

/** Offline: pasted text through the deterministic extractor (whole text as one chunk). */
function extractMock(profile: Profile, text: string): ImportResult {
  const at = nowIso();
  const turn = mockOnboardingTurn({ kind: profile.kind, profile, sections: [], transcript: [], newSegment: { id: "import", text, source: "text", at } });
  return {
    profilePatch: turn.profilePatch,
    sections: turn.sectionUpdates.map((s) => ({ key: s.key, body: s.body })) as ImportResult["sections"],
    worksFound: [],
    followUpQuestion: turn.followUpQuestion ?? followUpFor(profile.kind, { ...profile, ...turn.profilePatch } as Profile),
  };
}

function keepOriginal(profileId: string, req: ImportDossierRequest) {
  if (!req.fileDataUrl) return;
  const f = parseDataUrl(req.fileDataUrl);
  const ext = f.mediaType === "application/pdf" ? "pdf" : f.mediaType.split("/")[1];
  fs.writeFileSync(path.join(uploadsDir(), `dossier-import-${profileId}.${ext}`), Buffer.from(f.base64, "base64"));
}

/** Merge an imported body into an existing section without duplicating paragraphs already there. */
export function mergeBody(existing: string | undefined, imported: string): string {
  if (!existing?.trim()) return imported.trim();
  const have = new Set(existing.split(/\n\s*\n/).map((p) => p.trim()));
  const extra = imported
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !have.has(p));
  return [existing.trim(), ...extra].join("\n\n");
}

export async function importDossier(req: ImportDossierRequest): Promise<ImportDossierResponse> {
  const profile = getProfile(req.profileId);
  if (req.fileDataUrl && parseDataUrl(req.fileDataUrl).bytes > MAX_IMPORT_BYTES) throw new ImportUnsupportedError("El archivo pesa más de 20 MB. Prueba con un PDF más ligero o pega el texto.");
  const mock = isMockAi();
  if (mock && !req.text?.trim()) throw new ImportUnsupportedError("Ahora mismo no podemos leer archivos. Pega el texto de tu dossier y lo ordenamos igual.");

  const result = mock ? extractMock(profile, req.text!.trim()) : await extractWithClaude(profile, req);
  const patch = result.profilePatch;
  if (patch.disciplines) patch.disciplines = patch.disciplines.map((d) => d.toLocaleLowerCase("es-ES").trim());
  // Backstop (as in onboarding turns): matching needs the project and the needs; the model often leaves them in the text.
  if (!patch.projectIdea || !patch.fundingNeeds?.length) {
    const text = result.sections.map((x) => x.body).join("\n");
    const det = extractProfilePatch(text, profile.kind, profile);
    if (!patch.projectIdea && !profile.projectIdea && det.projectIdea) patch.projectIdea = det.projectIdea;
    if (!patch.fundingNeeds?.length && det.fundingNeeds?.length) patch.fundingNeeds = det.fundingNeeds;
  }
  keepOriginal(profile.id, req);

  const titles = sectionTitles(profile.kind);
  const dossier = getDossier(profile.id);
  const byKey = new Map((dossier?.sections ?? []).map((s) => [s.key, s]));
  const changedSectionKeys: string[] = [];
  const segmentIds: string[] = [];
  for (const s of result.sections) {
    if (!(s.key in titles) || !s.body.trim()) continue;
    const seg = await appendSegment(profile.id, s.body.trim(), "text");
    segmentIds.push(seg.id);
    const prev = byKey.get(s.key);
    const body = mergeBody(prev?.body, s.body);
    if (prev?.body === body) continue;
    const next: DossierSection = {
      key: s.key,
      title: prev?.title || titles[s.key],
      body,
      sourceSegmentIds: [...new Set([...(prev?.sourceSegmentIds ?? []), seg.id])],
      status: "draft",
      updatedAt: nowIso(),
    };
    byKey.set(s.key, next);
    changedSectionKeys.push(s.key);
  }
  const nextProfile = await saveProfile(mergeProfile(profile, patch));
  const order = Object.keys(titles);
  const sections = [...byKey.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  await saveDossier({
    profileId: profile.id,
    kind: profile.kind,
    sections,
    workIds: dossier?.workIds ?? listWorks(profile.id).map((w) => w.id),
    variant: dossier?.variant,
    generatedAt: nowIso(),
  });
  return {
    profile: nextProfile,
    sections,
    changedSectionKeys,
    changedProfileFields: changedFields(profile, nextProfile),
    followUpQuestion: result.followUpQuestion?.trim() || undefined,
    segmentIds,
    worksFound: result.worksFound,
    mode: mock ? "mock" : "ai",
  };
}
