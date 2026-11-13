// STUB (scaffold, working baseline). Owned by WP-02.
import fs from "node:fs";
import path from "node:path";
import type { Work } from "@/contracts";
import { getAi } from "@/server/ai";
import { getProfile, getWork, listWorks, newId, nowIso, saveWork, uploadsDir } from "@/server/store";

const MEDIA = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type Media = keyof typeof MEDIA;

export function parseDataUrl(dataUrl: string): { mediaType: Media; base64: string } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Imagen no válida (usa JPEG, PNG o WebP)");
  return { mediaType: m[1] as Media, base64: m[2] };
}

export async function createWork(input: { profileId?: string; imageDataUrl: string; voiceDescription?: string }): Promise<Work> {
  const profile = getProfile(input.profileId);
  const { mediaType, base64 } = parseDataUrl(input.imageDataUrl);
  const id = newId("work");
  fs.writeFileSync(path.join(uploadsDir(), `${id}.${MEDIA[mediaType]}`), Buffer.from(base64, "base64"));
  const described = await getAi().describeWork({ kind: profile.kind, imageBase64: base64, mediaType, voiceDescription: input.voiceDescription, profile });
  return saveWork({
    id,
    profileId: profile.id,
    imageUrl: `/api/works/${id}/image`,
    crop: described.crop,
    sheet: described.sheet,
    sheetSource: input.voiceDescription ? "voice" : "vision",
    confirmed: false,
    order: listWorks(profile.id).length,
    createdAt: nowIso(),
  });
}

export async function updateWork(id: string, patch: Partial<Pick<Work, "crop" | "confirmed" | "order">> & { sheet?: Partial<Work["sheet"]> }): Promise<Work> {
  const w = getWork(id);
  return saveWork({ ...w, ...patch, sheet: { ...w.sheet, ...patch.sheet } });
}

export function readWorkImage(id: string): { bytes: Buffer; mediaType: string } | undefined {
  for (const [mediaType, ext] of Object.entries(MEDIA)) {
    const f = path.join(uploadsDir(), `${id}.${ext}`);
    if (fs.existsSync(f)) return { bytes: fs.readFileSync(f), mediaType };
  }
  return undefined;
}
