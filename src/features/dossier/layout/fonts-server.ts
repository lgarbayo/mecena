/**
 * Server-only: makes the faces a layout asks for available (Google Fonts downloaded once to dataDir()/fonts)
 * BEFORE it is measured, and names the faces the PDF paints. A failed download is not an error: the bundled face
 * of the same category stands in, and the measurement (measure.ts resolveRender) uses that same stand-in.
 */
import { ensureFace, ttfFor } from "../pdf/fonts";
import { FONT_TABLE, snapFace, type FontFamilyName } from "./fonts";
import type { FreeLayout, PreparedLayout } from "./schema";

const offline = () => !!process.env.VITEST || process.env.MECENA_OFFLINE_FONTS === "1";

/** Downloads (if needed) every non-bundled face the layout uses. Never throws; bounded by the fetch timeouts. */
export async function ensureLayoutFonts(layout: FreeLayout): Promise<void> {
  if (offline()) return;
  const wanted = new Map<string, { family: FontFamilyName; weight: number; italic: boolean }>();
  for (const pg of layout.pages)
    for (const e of pg.elements) {
      if (e.type !== "text" || FONT_TABLE[e.family].bundled) continue;
      const f = snapFace(e.family, e.weight, e.italic);
      wanted.set(`${e.family}|${f.weight}|${f.italic}`, { family: e.family, ...f });
    }
  await Promise.all([...wanted.values()].map((f) => ttfFor(f.family, f.weight, f.italic).catch(() => undefined)));
}

export interface PdfFont {
  family: string; // react-pdf family name
  weight: number;
  italic: boolean;
}

/** For each face of a prepared layout: how the PDF paints it (registering downloaded TTFs). */
export async function pdfFontsFor(prepared: PreparedLayout): Promise<Map<string, PdfFont>> {
  const out = new Map<string, PdfFont>();
  const seen = new Map<string, Promise<void>>();
  for (const pg of prepared.pages)
    for (const e of pg.elements) {
      if (e.type !== "text") continue;
      const key = fontKey(e.renderFamily, e.weight, e.italic);
      if (seen.has(key)) continue;
      seen.set(
        key,
        (async () => {
          const info = FONT_TABLE[e.renderFamily];
          if (info.bundled) {
            out.set(key, { family: e.renderFamily === "Schibsted Grotesk" ? "Sans" : "Serif", weight: e.weight, italic: e.italic });
            return;
          }
          const name = await ensureFace(e.renderFamily, e.weight, e.italic).catch(() => undefined);
          out.set(key, name ? { family: name, weight: 400, italic: false } : { family: "Serif", weight: 400, italic: false });
        })(),
      );
    }
  await Promise.all(seen.values());
  return out;
}

export const fontKey = (family: string, weight: number, italic: boolean) => `${family}|${weight}|${italic}`;
