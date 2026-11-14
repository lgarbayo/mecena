/**
 * Server-only: the photo the PDF embeds, framed like the screen shows it. The crop/straighten the artist
 * sees in /obras (CSS over the untouched original) is applied here to an in-memory copy with sharp; the
 * original upload on disk is never written. Optionally the copy is downscaled (call variants with a file
 * size limit). Anything unexpected -> the original bytes, uncropped (the PDF must always render).
 */
import type { CropSuggestion } from "@/contracts";
import { isIdentityCrop } from "@/features/works/image";
import type { PdfImage } from "./images";

/** Long edge for the "smaller photos" pass when a call caps the file size. */
export const REDUCED_EDGE = 1200;

type Sharp = typeof import("sharp");
let sharpLib: Sharp | null | undefined;

async function loadSharp(): Promise<Sharp | null> {
  if (sharpLib !== undefined) return sharpLib;
  try {
    const mod = (await import("sharp")) as unknown as { default?: Sharp } & Sharp;
    sharpLib = mod.default ?? mod;
  } catch (e) {
    console.warn("[dossier] sharp not available: PDF photos go uncropped", e instanceof Error ? e.message : e);
    sharpLib = null;
  }
  return sharpLib;
}

/**
 * Pixel box of the crop after rotating the whole photo by `rotationDeg` (clockwise, as CSS rotate()) around
 * its centre into a canvas of `rotated` size. The screen rotates around the crop centre and then clips the
 * crop box; rotating around the photo centre only translates the result, so the same box centred on the
 * rotated crop centre shows the same pixels. Clamped inside the rotated canvas.
 */
export function cropBox(
  crop: CropSuggestion,
  natural: { width: number; height: number },
  rotated: { width: number; height: number } = natural,
): { left: number; top: number; width: number; height: number } {
  const t = ((crop.rotationDeg ?? 0) * Math.PI) / 180;
  const qx = (crop.x + crop.width / 2) * natural.width - natural.width / 2;
  const qy = (crop.y + crop.height / 2) * natural.height - natural.height / 2;
  const cx = qx * Math.cos(t) - qy * Math.sin(t) + rotated.width / 2;
  const cy = qx * Math.sin(t) + qy * Math.cos(t) + rotated.height / 2;
  const width = Math.max(1, Math.min(rotated.width, Math.round(crop.width * natural.width)));
  const height = Math.max(1, Math.min(rotated.height, Math.round(crop.height * natural.height)));
  const left = Math.min(Math.max(0, Math.round(cx - width / 2)), rotated.width - width);
  const top = Math.min(Math.max(0, Math.round(cy - height / 2)), rotated.height - height);
  return { left, top, width, height };
}

/**
 * The image to embed: cropped/straightened when the work has a crop, downscaled to `maxEdge` when asked.
 * Without a crop and without a size cap the original bytes go in untouched (no re-encoding).
 */
export async function framePdfImage(img: PdfImage, crop: CropSuggestion | undefined, opts: { maxEdge?: number } = {}): Promise<PdfImage> {
  const cropped = !isIdentityCrop(crop);
  if (!cropped && !opts.maxEdge) return img;
  const sharp = await loadSharp();
  if (!sharp) return img;
  try {
    // Upright first (honours EXIF orientation like the browser does), so crop coordinates match the screen.
    const upright = await sharp(img.data).rotate().toBuffer({ resolveWithObject: true });
    let pipeline = sharp(upright.data);
    if (cropped && crop) {
      const natural = { width: upright.info.width, height: upright.info.height };
      let size = natural;
      if (crop.rotationDeg) {
        const turned = await pipeline.rotate(crop.rotationDeg, { background: { r: 255, g: 255, b: 255, alpha: 1 } }).toBuffer({ resolveWithObject: true });
        size = { width: turned.info.width, height: turned.info.height };
        pipeline = sharp(turned.data);
      }
      pipeline = pipeline.extract(cropBox(crop, natural, size));
    }
    if (opts.maxEdge) pipeline = pipeline.resize({ width: opts.maxEdge, height: opts.maxEdge, fit: "inside", withoutEnlargement: true });
    const data = await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: opts.maxEdge ? 78 : 88, mozjpeg: true }).toBuffer();
    return { data, format: "jpg" };
  } catch (e) {
    console.warn("[dossier] could not frame a PDF photo, using the original", e instanceof Error ? e.message : e);
    return img;
  }
}
