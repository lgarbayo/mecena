/**
 * Browser-side photo helpers (WP-02). Downscaling only resizes the photo for upload; the crop is
 * never baked in: it is shown with CSS over the full photo so the original is always one tap away.
 */
import type { CSSProperties } from "react";
import type { CropSuggestion } from "@/contracts";

export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.85;

/** Target size keeping aspect ratio, long edge <= maxEdge (never upscales). */
export function fitWithin(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Approximate decoded size of a base64 data URL, in bytes. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
}

/**
 * Read a camera photo, honour its EXIF orientation, downscale (<= 1600 px long edge) and re-encode as
 * JPEG ~0.85 so the upload stays well under 2 MB. Falls back to a lower quality if still too large.
 */
export async function downscalePhoto(file: File, maxEdge = MAX_EDGE, quality = JPEG_QUALITY): Promise<{ dataUrl: string; width: number; height: number }> {
  const source = await loadBitmap(file);
  const { width, height } = fitWithin(source.width, source.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no puede preparar la foto");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source.image, 0, 0, width, height);
  source.close?.();
  let q = quality;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  while (dataUrlBytes(dataUrl) > 1.8 * 1024 * 1024 && q > 0.5) {
    q -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }
  return { dataUrl, width, height };
}

type Loaded = { image: CanvasImageSource; width: number; height: number; close?: () => void };

async function loadBitmap(file: File): Promise<Loaded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* HEIC on some browsers, or old Safari: try <img> below */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("No hemos podido leer la foto. Prueba con JPEG o PNG."));
      img.src = url;
    });
    return { image: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export const isIdentityCrop = (c: CropSuggestion | undefined) =>
  !c || (c.x <= 0.001 && c.y <= 0.001 && c.width >= 0.999 && c.height >= 0.999 && Math.abs(c.rotationDeg ?? 0) < 0.05);

/**
 * CSS that shows only the crop rectangle of the untouched original: the frame gets the crop's aspect
 * ratio, the <img> is scaled/offset inside it (overflow hidden) and rotated around the crop centre.
 * `maxHeight` is the tallest the frame may be (a CSS length): the frame's width is capped at
 * maxHeight × ratio, so a tall (portrait) crop shrinks as a whole instead of being squashed.
 */
export function cropStyles(
  crop: CropSuggestion | undefined,
  natural: { width: number; height: number } | null,
  opts: { maxHeight?: string } = {},
): { frame: CSSProperties; img: CSSProperties } {
  const maxHeight = opts.maxHeight ?? "70vh";
  const fit = (w: number, h: number): CSSProperties => ({
    aspectRatio: `${w.toFixed(1)} / ${h.toFixed(1)}`,
    width: "100%",
    maxWidth: `calc(${maxHeight} * ${(w / h).toFixed(4)})`,
    marginInline: "auto",
  });
  if (!natural || !natural.width || !natural.height || isIdentityCrop(crop) || !crop) {
    return { frame: natural && natural.width && natural.height ? fit(natural.width, natural.height) : {}, img: { width: "100%", height: "100%", objectFit: "contain" } };
  }
  const rot = crop.rotationDeg ?? 0;
  const cx = (crop.x + crop.width / 2) * 100;
  const cy = (crop.y + crop.height / 2) * 100;
  return {
    frame: fit(crop.width * natural.width, crop.height * natural.height),
    img: {
      position: "absolute",
      width: `${(100 / crop.width).toFixed(4)}%`,
      height: `${(100 / crop.height).toFixed(4)}%`,
      left: `${(-(crop.x / crop.width) * 100).toFixed(4)}%`,
      top: `${(-(crop.y / crop.height) * 100).toFixed(4)}%`,
      maxWidth: "none",
      transformOrigin: `${cx.toFixed(2)}% ${cy.toFixed(2)}%`,
      transform: rot ? `rotate(${rot}deg)` : undefined,
    },
  };
}
