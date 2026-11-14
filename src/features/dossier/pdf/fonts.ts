/**
 * Server-only: makes the design's Google Fonts available to @react-pdf. Downloads the TTF once into
 * dataDir()/fonts and registers it; any failure (offline venue wifi, unknown family) returns undefined
 * and the PDF uses the bundled face of the same category. Never blocks a download for more than a few seconds.
 */
import fs from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";
import { dataDir } from "@/server/store";
import { BUNDLED_FAMILIES, type DossierDesign } from "../design";

const registered = new Map<string, boolean>();
const TIMEOUT_MS = 4000;

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

export async function ttfFor(family: string, weight: number, italic: boolean): Promise<string | undefined> {
  const dir = path.join(dataDir(), "fonts");
  const file = path.join(dir, `${slugify(family)}-${weight}${italic ? "-italic" : ""}.ttf`);
  if (fs.existsSync(file)) return file;
  const fam = family.trim().replace(/ /g, "+");
  const axes = italic ? `ital,wght@1,${weight}` : `wght@${weight}`;
  let css: string;
  try {
    css = await fetchText(`https://fonts.googleapis.com/css2?family=${fam}:${axes}&display=swap`);
  } catch {
    // The family may not have that weight or italic: take whatever it has.
    css = await fetchText(`https://fonts.googleapis.com/css2?family=${fam}&display=swap`);
  }
  // Prefer the latin subset block when there are several.
  const blocks = css.split("@font-face").filter((b) => b.includes(".ttf"));
  const block = blocks.find((b) => /U\+0000-00FF/.test(b)) ?? blocks[blocks.length - 1];
  const url = block && /url\((https:[^)]+\.ttf)\)/.exec(block)?.[1];
  if (!url) return undefined;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return undefined;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/** Registers one face under a private family name. Returns that name, or undefined to use the fallback. */
export async function ensureFace(family: string, weight: number, italic: boolean): Promise<string | undefined> {
  if (BUNDLED_FAMILIES.has(family)) return undefined;
  if (process.env.VITEST || process.env.MECENA_OFFLINE_FONTS === "1") return undefined;
  const name = `D-${slugify(family)}-${weight}${italic ? "i" : ""}`;
  if (registered.has(name)) return registered.get(name) ? name : undefined;
  try {
    const file = await ttfFor(family, weight, italic);
    if (!file) throw new Error("no ttf");
    Font.register({ family: name, src: file });
    registered.set(name, true);
    return name;
  } catch (e) {
    console.warn(`[dossier] font ${family} ${weight} unavailable for the PDF, using the bundled face`, e instanceof Error ? e.message : e);
    registered.set(name, false);
    return undefined;
  }
}

export interface PdfFaces {
  display?: string; // registered family for names and section titles
  body?: string; // registered family for running text
}

export async function loadDesignFonts(design?: DossierDesign): Promise<PdfFaces> {
  if (!design) return {};
  const { display, body } = design.type;
  const [d, b] = await Promise.all([ensureFace(display.family, display.weight, display.italic), ensureFace(body.family, 400, false)]);
  return { display: d, body: b };
}
