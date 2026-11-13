/**
 * Server-only: resolve a work's served URL to image bytes for the PDF, reading from disk (never over HTTP).
 * @react-pdf only embeds PNG and JPEG; anything else (SVG demo art, WebP) returns undefined and the
 * template draws an empty frame with the title instead of failing.
 */
import fs from "node:fs";
import path from "node:path";
import { readWorkImage } from "@/features/works/service";

export interface PdfImage {
  data: Buffer;
  format: "png" | "jpg";
}

export function sniff(bytes: Buffer): PdfImage["format"] | undefined {
  if (bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return undefined;
}

export function readImageBytes(url: string): Buffer | undefined {
  try {
    const upload = /^\/api\/works\/([^/?#]+)\/image/.exec(url);
    if (upload) return readWorkImage(decodeURIComponent(upload[1]))?.bytes;
    const data = /^data:image\/[a-z+]+;base64,(.+)$/.exec(url);
    if (data) return Buffer.from(data[1], "base64");
    if (url.startsWith("/") && !url.includes("..")) {
      const f = path.join(process.cwd(), "public", url.split(/[?#]/)[0]);
      if (fs.existsSync(f)) return fs.readFileSync(f);
    }
  } catch (e) {
    console.warn("[dossier] could not read image", url, e);
  }
  return undefined;
}

export function loadPdfImage(url: string): PdfImage | undefined {
  const bytes = readImageBytes(url);
  if (!bytes) return undefined;
  const format = sniff(bytes);
  return format ? { data: bytes, format } : undefined;
}
