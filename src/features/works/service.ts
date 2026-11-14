/**
 * Works service (WP-02). The uploaded photo is stored byte-for-byte as received: we never write a
 * modified image. Crop/rotation live only as numbers on the Work and are applied with CSS.
 */
import fs from "node:fs";
import path from "node:path";
import { mediaKindFromLink, type CropSuggestion, type DescribeWorkResult, type MediaKind, type Work } from "@/contracts";
import { getAi } from "@/server/ai";
import { getProfile, getWork, listWorks, newId, nowIso, saveWork, updateDb, uploadsDir } from "@/server/store";
import { inferMediaKind, normalizeLinks } from "./links";
import { extractLinks, sheetFromVoice, UNTITLED } from "./parse";

const MEDIA = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type Media = keyof typeof MEDIA;

/** Client downscales to <= 1600 px / JPEG 0.85 (~0.3-0.8 MB); this is a generous safety net. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

export function parseDataUrl(dataUrl: string): { mediaType: Media; base64: string } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new InvalidImageError("Imagen no válida (usa JPEG, PNG o WebP)");
  return { mediaType: m[1] as Media, base64: m[2] };
}

function imagePath(id: string): { file: string; mediaType: Media } | undefined {
  for (const [mediaType, ext] of Object.entries(MEDIA)) {
    const file = path.join(uploadsDir(), `${id}.${ext}`);
    if (fs.existsSync(file)) return { file, mediaType: mediaType as Media };
  }
  return undefined;
}

function sameImage(id: string, mediaType: Media, bytes: Buffer): boolean {
  const stored = imagePath(id);
  if (!stored || stored.mediaType !== mediaType || fs.statSync(stored.file).size !== bytes.length) return false;
  return fs.readFileSync(stored.file).equals(bytes);
}

export async function createWork(input: {
  profileId: string;
  imageDataUrl: string;
  voiceDescription?: string;
  /** false: store the photo only (no AI); the sheet and crop come from describeWork. Default true. */
  describe?: boolean;
  mediaKind?: MediaKind;
  links?: string[];
}): Promise<Work> {
  const profile = getProfile(input.profileId);
  const { mediaType, base64 } = parseDataUrl(input.imageDataUrl);
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) throw new InvalidImageError("La imagen está vacía");
  if (bytes.length > MAX_IMAGE_BYTES) throw new InvalidImageError("La foto pesa demasiado (máx. 6 MB). Prueba otra vez desde la cámara.");
  // A photo-only upload that repeats one still waiting for its reading (double tap, retry with a new key)
  // is the same work: hand that one back instead of storing the photo twice.
  if (input.describe === false) {
    const twin = listWorks(profile.id).find((w) => w.analysis === "pending" && sameImage(w.id, mediaType, bytes));
    if (twin) return twin;
  }
  const id = newId("work");
  fs.writeFileSync(path.join(uploadsDir(), `${id}.${MEDIA[mediaType]}`), bytes);
  const voice = input.voiceDescription?.trim() || undefined;
  const existing = listWorks(profile.id);
  const links = normalizeLinks([...(input.links ?? []), ...extractLinks(voice)]);
  const base: Work = {
    id,
    profileId: profile.id,
    imageUrl: `/api/works/${id}/image`,
    originalImageUrl: `/api/works/${id}/image`,
    sheet: { title: UNTITLED },
    sheetSource: voice ? "voice" : "vision",
    confirmed: false,
    order: existing.length ? Math.max(...existing.map((w) => w.order)) + 1 : 0,
    createdAt: nowIso(),
    mediaKind: inferMediaKind({ explicit: input.mediaKind, links, profile }),
    links,
  };
  if (input.describe === false) return saveWork({ ...base, analysis: "pending" });
  // One vision call per work: photo + note -> sheet + crop.
  const described = await getAi().describeWork({ kind: profile.kind, imageBase64: base64, mediaType, voiceDescription: voice, profile });
  return saveWork({ ...base, ...visionFields(described), sheet: described.sheet });
}

/** Crop + analysis status from a vision result. The suggestion is kept apart so the artist can restore it. */
function visionFields(r: DescribeWorkResult): Pick<Work, "crop" | "suggestedCrop" | "analysis"> {
  return { crop: r.crop, suggestedCrop: r.crop, analysis: r.fallback ? "failed" : "ok" };
}

const sameCrop = (a?: CropSuggestion, b?: CropSuggestion) =>
  !!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && (a.rotationDeg ?? 0) === (b.rotationDeg ?? 0);

/**
 * The one vision call for a photo stored with `describe: false` (or a re-read with a new note): technical
 * sheet + crop. Fields the artist already edited by hand are kept unless the new note says something
 * about them; a crop the artist changed or removed is kept too.
 */
export async function describeWork(id: string, voiceDescription?: string): Promise<Work> {
  const voice = voiceDescription?.trim() || undefined;
  const w = voice ? withLinksFromVoice(getWork(id), voice) : getWork(id);
  const img = imagePath(id);
  const profile = getProfile(w.profileId);
  if (!img) {
    // Seeded/demo works have no upload: a voice-only sheet, no vision call.
    if (!voice) return w;
    return saveWork({ ...w, sheet: { ...w.sheet, ...stripEmpty(sheetFromVoice(voice)) }, sheetSource: "voice", confirmed: false });
  }
  const base64 = fs.readFileSync(img.file).toString("base64");
  const r = await getAi().describeWork({ kind: profile.kind, imageBase64: base64, mediaType: img.mediaType, voiceDescription: voice, profile });
  let sheet: Work["sheet"];
  if (w.sheetSource === "manual") {
    sheet = { ...w.sheet, ...stripEmpty(r.sheet, true) };
  } else {
    // Not touched by hand: the new reading replaces the old one. The concept in particular is replaced,
    // never merged, so a sentence the artist no longer says does not linger.
    sheet = { title: r.sheet.title, ...stripEmpty(w.sheet), ...stripEmpty(r.sheet) };
    if (!stripEmpty(r.sheet).concept) delete sheet.concept;
  }
  // The artist's own crop (changed or removed by hand) wins; otherwise take the new suggestion.
  const ownCrop = w.crop !== undefined && !sameCrop(w.crop, w.suggestedCrop);
  const vision = visionFields(r);
  return saveWork({
    ...w,
    sheet: { ...sheet, title: sheet.title || r.sheet.title },
    ...vision,
    crop: ownCrop ? w.crop : vision.crop,
    sheetSource: voice ? "voice" : w.sheetSource === "manual" ? "manual" : "vision",
    confirmed: false,
  });
}

/** Links typed into the note join the work's links; a first media link can tell what the work is. */
function withLinksFromVoice(w: Work, voice: string): Work {
  const found = extractLinks(voice);
  if (!found.length) return w;
  const before = w.links ?? [];
  const links = normalizeLinks([...before, ...found]);
  return { ...w, links, mediaKind: before.length ? w.mediaKind : (mediaKindFromLink(links[0]) ?? w.mediaKind) };
}

function stripEmpty<T extends Record<string, unknown>>(o: T, dropUntitled = false): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && v !== "" && !(dropUntitled && k === "title" && v === "Sin título"))) as Partial<T>;
}

export async function updateWork(
  id: string,
  patch: Partial<Pick<Work, "crop" | "confirmed" | "order" | "mediaKind" | "links">> & { sheet?: Partial<Work["sheet"]> },
): Promise<Work> {
  const w = getWork(id);
  const extra: Partial<Work> = {};
  if (patch.links) {
    const links = normalizeLinks(patch.links);
    extra.links = links;
    // A newly added video/audio link says what the work is, unless the artist picked the kind themselves.
    const added = links.filter((l) => !(w.links ?? []).includes(l));
    const fromLink = added.map(mediaKindFromLink).find(Boolean);
    if (fromLink && !patch.mediaKind) extra.mediaKind = fromLink;
  }
  const sheetEdited = patch.sheet && Object.keys(patch.sheet).length > 0;
  const sheet = { ...w.sheet, ...patch.sheet };
  // Empty strings mean "the artist cleared this field": store as absent, not as "".
  for (const k of ["technique", "dimensions", "series", "concept", "duration", "credits", "venue"] as const) if (sheet[k] === "") delete sheet[k];
  if (!sheet.year) delete sheet.year; // 0 = cleared by the artist
  if (!sheet.title?.trim()) sheet.title = "Sin título";
  return saveWork({ ...w, ...patch, ...extra, sheet, sheetSource: sheetEdited ? "manual" : w.sheetSource });
}

/** Move a work one place up (-1) or down (+1) in the profile's order; renumbers 0..n-1. */
export async function moveWork(id: string, direction: -1 | 1): Promise<Work[]> {
  const w = getWork(id);
  return updateDb((db) => {
    const mine = db.works.filter((x) => x.profileId === w.profileId).sort((a, b) => a.order - b.order);
    const i = mine.findIndex((x) => x.id === id);
    const j = i + direction;
    if (j >= 0 && j < mine.length) [mine[i], mine[j]] = [mine[j], mine[i]];
    mine.forEach((x, k) => (x.order = k));
    return mine.map((x) => ({ ...x }));
  });
}

export async function deleteWork(id: string): Promise<void> {
  const w = getWork(id);
  await updateDb((db) => {
    db.works = db.works.filter((x) => x.id !== id);
    db.works.filter((x) => x.profileId === w.profileId).sort((a, b) => a.order - b.order).forEach((x, k) => (x.order = k));
  });
  const img = imagePath(id);
  if (img) fs.rmSync(img.file, { force: true });
}

export function readWorkImage(id: string): { bytes: Buffer; mediaType: string } | undefined {
  const img = imagePath(id);
  return img ? { bytes: fs.readFileSync(img.file), mediaType: img.mediaType } : undefined;
}
