/**
 * Calls that want the photos themselves (loose JPG/TIFF/PNG files), not a dossier PDF: A Laracha, La Salita,
 * Calahorra, Cabra… For those the dossier page says so prominently and offers the original photos to download.
 * Pure and client-safe.
 */
import type { Call, Work } from "@/contracts";

const IMAGE_FORMAT = /\b(jpe?g|tiff?|png)\b/i;
const PDF_DOSSIER = /dossier|portfolio|porfolio/i;

/** True when the bases ask for image files (JPG, TIFF, PNG) and not for a dossier/portfolio document. */
export function wantsLooseImages(call: Pick<Call, "dossierRequirements" | "requiredDocuments"> | undefined): boolean {
  if (!call) return false;
  const format = call.dossierRequirements?.format ?? "";
  if (format) return IMAGE_FORMAT.test(format) && !PDF_DOSSIER.test(format);
  // No format line: a required document that is itself an image file ("1 foto por obra en JPG o TIF").
  return call.requiredDocuments.some((d) => IMAGE_FORMAT.test(d) && /foto|imagen|cartel|archivo/i.test(d) && !PDF_DOSSIER.test(d));
}

/** True when the bases ask for a minimum resolution or "alta resolución" (our uploads are downscaled for the web). */
export function wantsHighResolution(call: Pick<Call, "dossierRequirements" | "requiredDocuments"> | undefined): boolean {
  if (!call) return false;
  const text = [call.dossierRequirements?.format, call.dossierRequirements?.notes, ...call.requiredDocuments].filter(Boolean).join(" ");
  return /alta resoluci[oó]n|\d{3,5}\s*[×x]\s*\d{3,5}\s*px|\d{3}\s*ppp|\bdpi\b|\btiff?\b/i.test(text);
}

/** "Artista – Título.jpg": the naming many bases ask for (La Salita), safe on every OS. */
export function imageFileName(artist: string, work: Pick<Work, "sheet">, ext: string, n: number): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  const title = clean(work.sheet.title || "") || `Obra ${n}`;
  const who = clean(artist);
  return `${String(n).padStart(2, "0")} ${who ? `${who} – ` : ""}${title}.${ext}`.slice(0, 120);
}
