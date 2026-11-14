/**
 * Server-only text measurement for the free layout guard: real advance widths from the bundled TTFs
 * (the ones the PDF embeds), through fontkit. If fontkit cannot load, a conservative average width is used,
 * so the guard errs on the side of shrinking, never of cutting text.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { dataDir } from "@/server/store";
import { FONT_TABLE, fallbackFamilyFor, snapFace, type FontFamilyName, type FontInfo } from "./fonts";

type Face = { layout: (s: string) => { advanceWidth: number }; unitsPerEm: number };
const FONT_DIR = path.join(process.cwd(), "src/features/dossier/fonts");
const cache = new Map<string, Face | null>();
let fontkit: { openSync: (file: string) => Face } | null | undefined;

function loadFontkit() {
  if (fontkit !== undefined) return fontkit;
  try {
    const req = createRequire(path.join(process.cwd(), "package.json"));
    const mod = req("fontkit");
    fontkit = (mod.default ?? mod) as typeof fontkit;
  } catch {
    fontkit = null;
  }
  return fontkit;
}

const slugify = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export interface RenderFace {
  renderFamily: FontFamilyName; // what is really painted: the family itself, or a bundled stand-in of its category
  weight: number;
  italic: boolean;
  file?: string; // TTF to measure with (and, for downloaded families, to register in the PDF)
  downloaded: boolean;
}

/** Decides the face the PDF and the measurement both use: bundled, a downloaded Google face already on disk, or a bundled stand-in. */
export function resolveRender(family: FontFamilyName, weight: number, italic: boolean): RenderFace {
  const want = snapFace(family, weight, italic);
  const info = FONT_TABLE[family] as FontInfo;
  if (info.bundled) return { renderFamily: family, ...want, file: path.join(FONT_DIR, bundledFile(family, want.weight, want.italic)), downloaded: false };
  const cached = path.join(dataDir(), "fonts", `${slugify(family)}-${want.weight}${want.italic ? "-italic" : ""}.ttf`);
  if (fs.existsSync(cached)) return { renderFamily: family, ...want, file: cached, downloaded: true };
  const stand = fallbackFamilyFor(info.category);
  const sw = snapFace(stand, weight, italic);
  return { renderFamily: stand, ...sw, file: path.join(FONT_DIR, bundledFile(stand, sw.weight, sw.italic)), downloaded: false };
}

function bundledFile(family: FontFamilyName, weight: number, italic: boolean): string {
  return family === "Schibsted Grotesk" ? `SchibstedGrotesk-${weight}-normal.ttf` : `Newsreader-${weight}-${italic ? "italic" : "normal"}.ttf`;
}

function getFace(file: string | undefined): Face | null {
  if (!file) return null;
  if (cache.has(file)) return cache.get(file)!;
  let face: Face | null = null;
  try {
    const fk = loadFontkit();
    if (fk && fs.existsSync(file)) face = fk.openSync(file);
  } catch {
    face = null;
  }
  cache.set(file, face);
  return face;
}

export interface TextStyleForMeasure {
  family: FontFamilyName;
  weight: number;
  italic: boolean;
  size: number; // pt
  tracking: number; // em
  uppercase: boolean;
}

/** Width in pt of one line of text. */
export function textWidth(text: string, s: TextStyleForMeasure): number {
  const t = s.uppercase ? text.toLocaleUpperCase("es-ES") : text;
  const face = getFace(resolveRender(s.family, s.weight, s.italic).file);
  let w: number;
  if (face) {
    try {
      w = (face.layout(t).advanceWidth * s.size) / face.unitsPerEm;
    } catch {
      w = t.length * s.size * 0.56;
    }
  } else {
    w = t.length * s.size * 0.56;
  }
  return w + t.length * s.tracking * s.size;
}

/** Breaks one paragraph into lines for a box `widthPt` wide (greedy, like a PDF engine; over-long words split). */
export function wrapParagraph(text: string, widthPt: number, s: TextStyleForMeasure): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const memo = new Map<string, number>();
  const wOf = (str: string) => {
    let v = memo.get(str);
    if (v === undefined) memo.set(str, (v = textWidth(str, s)));
    return v;
  };
  const space = wOf(" ");
  const lines: string[] = [];
  let line: string[] = [];
  let lineW = 0;
  const flush = () => {
    if (line.length) lines.push(line.join(" "));
    line = [];
    lineW = 0;
  };
  for (const word of words) {
    const ww = wOf(word);
    if (ww <= widthPt) {
      if (line.length && lineW + space + ww > widthPt) flush();
      lineW += (line.length ? space : 0) + ww;
      line.push(word);
      continue;
    }
    // a single word wider than the box: split it by characters
    flush();
    let chunk = "";
    for (const ch of word) {
      if (wOf(chunk + ch) <= widthPt) chunk += ch;
      else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    line = chunk ? [chunk] : [];
    lineW = chunk ? wOf(chunk) : 0;
  }
  flush();
  return lines.length ? lines : [""];
}

/** Gap between paragraphs, in em. The renderers use the same value. */
export const PARA_GAP_EM = 0.55;

/** Height in pt a set of paragraphs needs in a box `widthPt` wide, with the lines per paragraph. */
export function textHeight(paragraphs: string[], widthPt: number, s: TextStyleForMeasure, lineHeight: number): { height: number; lines: number } {
  let lines = 0;
  for (const p of paragraphs) lines += wrapParagraph(p, widthPt, s).length;
  const height = lines * s.size * lineHeight + Math.max(0, paragraphs.length - 1) * PARA_GAP_EM * s.size;
  return { height, lines };
}
