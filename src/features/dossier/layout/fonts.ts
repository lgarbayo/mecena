/**
 * Typefaces a free layout may use: the two bundled families (TTFs in ../fonts, no network) plus the Google Fonts
 * the design agent already uses (downloaded once into dataDir()/fonts for the PDF; the page loads them from Google).
 * If a download fails the PDF and the measurement both use the bundled face of the same category, so nothing overflows.
 * Pure module: client-safe.
 */
export type FontCategory = "serif" | "sans" | "mono" | "display" | "handwriting";
export interface FontInfo {
  category: FontCategory;
  weights: number[]; // weights the family really has (regular first)
  italic: boolean;
  bundled: boolean;
}

const f = (category: FontCategory, weights: number[], italic = false, bundled = false): FontInfo => ({ category, weights, italic, bundled });

export const FONT_TABLE = {
  Newsreader: f("serif", [400, 500], true, true),
  "Schibsted Grotesk": f("sans", [400, 500, 600], false, true),
  "Cormorant Garamond": f("serif", [400, 500, 600], true),
  "EB Garamond": f("serif", [400, 500], true),
  Fraunces: f("serif", [400, 600], true),
  "Instrument Serif": f("serif", [400], true),
  "Libre Caslon Text": f("serif", [400], true),
  Spectral: f("serif", [400, 500], true),
  "Bodoni Moda": f("serif", [400, 500, 600], true),
  Gloock: f("display", [400]),
  "Young Serif": f("display", [400]),
  "Bricolage Grotesque": f("sans", [400, 500, 600]),
  "Hanken Grotesk": f("sans", [400, 500, 600]),
  "Space Grotesk": f("sans", [400, 500]),
  Syne: f("display", [400, 500, 600]),
  Archivo: f("sans", [400, 500, 600]),
  Unbounded: f("display", [400, 500]),
  "Familjen Grotesk": f("sans", [400, 500, 600]),
  "DM Mono": f("mono", [400, 500], true),
  "Space Mono": f("mono", [400], true),
  Caveat: f("handwriting", [400, 500, 600]),
} as const satisfies Record<string, FontInfo>;

export type FontFamilyName = keyof typeof FONT_TABLE;
export const FONT_FAMILIES = Object.keys(FONT_TABLE) as [FontFamilyName, ...FontFamilyName[]];

/** The weight and italic the family really has, nearest to what was asked. */
export function snapFace(family: FontFamilyName, weight: number, italic: boolean): { weight: number; italic: boolean } {
  const info: FontInfo = FONT_TABLE[family];
  const w = info.weights.reduce((best, x) => (Math.abs(x - weight) < Math.abs(best - weight) ? x : best), info.weights[0]);
  return { weight: w, italic: italic && info.italic };
}

/** Bundled stand-in of a category, for a family that could not be downloaded. */
export const fallbackFamilyFor = (category: FontCategory): FontFamilyName => (category === "serif" || category === "handwriting" ? "Newsreader" : "Schibsted Grotesk");

export function googleFontUrlsFor(faces: { family: FontFamilyName; weight: number; italic: boolean }[]): string[] {
  const out = new Set<string>();
  for (const x of faces) {
    if (FONT_TABLE[x.family].bundled) continue;
    const fam = x.family.replace(/ /g, "+");
    out.add(`https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${x.italic ? 1 : 0},${x.weight}&display=swap`);
  }
  return [...out];
}
