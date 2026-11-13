/**
 * Dossier styles: one editorial system, three looks. The look is suggested by the call the dossier is for
 * (or by the profile when there is no call) and the artist can always override it.
 * Pure module (no Node or browser APIs): shared by the page, the PDF and the variant notes.
 */
import type { Call, Profile, ProfileKind } from "@/contracts";

export const DOSSIER_STYLES = ["sobrio", "editorial", "galeria"] as const;
export type DossierStyle = (typeof DOSSIER_STYLES)[number];

export const STYLE_LABELS: Record<DossierStyle, string> = {
  sobrio: "Sobrio",
  editorial: "Editorial",
  galeria: "Galería",
};


export function isDossierStyle(v: unknown): v is DossierStyle {
  return typeof v === "string" && (DOSSIER_STYLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------- fit: which look suits this call

const BOOKISH = ["narrativa", "poesia", "ensayo", "literatura", "comic", "ilustracion", "diseno-grafico", "guion"];
const VISUAL = ["pintura", "fotografia", "escultura", "artes-visuales", "arte-urbano", "grabado", "instalacion", "artesania"];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");

function countIn(list: string[], pool: string[]): number {
  const ns = list.map(norm);
  return pool.filter((p) => ns.some((n) => n.includes(p))).length;
}

export interface StyleSuggestion {
  style: DossierStyle;
  reason: string; // Spanish, completes "Estilo «X»: …"
}

/** Picks the look from the call first (that is who reads the dossier), then from the profile. */
export function suggestStyle(input: { call?: Call; profile?: Pick<Profile, "kind" | "disciplines">; kind?: ProfileKind }): StyleSuggestion {
  const { call, profile } = input;
  const kind = profile?.kind ?? input.kind ?? "creator";
  if (kind === "business") return { style: "sobrio", reason: "un dossier de empresa se lee mejor claro y ordenado" };
  if (call) {
    const admin = call.type === "ayuda" || call.type === "subvencion";
    const bookish = countIn(call.disciplines, BOOKISH);
    const visual = countIn(call.disciplines, VISUAL);
    if (bookish > visual) return { style: "editorial", reason: "es una convocatoria de letras, ilustración o diseño, y ese jurado lee con ojo de editor" };
    if (visual > 0 && !admin) return { style: "galeria", reason: "es un jurado de artes visuales y la obra luce grande y sobre blanco, como en una sala" };
    if (admin) return { style: "sobrio", reason: "en una ayuda pública la comisión valora la claridad" };
  }
  const disciplines = profile?.disciplines ?? [];
  const bookish = countIn(disciplines, BOOKISH);
  const visual = countIn(disciplines, VISUAL);
  if (bookish > visual) return { style: "editorial", reason: "encaja con tu disciplina" };
  if (visual > 0) return { style: "galeria", reason: "deja que tu obra mande" };
  return { style: "sobrio", reason: "es el estilo más versátil" };
}

/** Requested style wins; otherwise the suggestion. */
export function resolveStyle(input: { requested?: string | null; call?: Call; profile?: Pick<Profile, "kind" | "disciplines"> }): DossierStyle {
  return isDossierStyle(input.requested) ? input.requested : suggestStyle(input).style;
}

// ---------------------------------------------------------------- colour

export interface StyleTokens {
  paper: string;
  ink: string;
  granite: string;
  hair: string;
  wall: string;
  ground: string;
  accent: string;
  accentSoft: string;
  onInk: string;
  inkRule: string;
  display: "sans" | "serif";
  flatFrames: boolean; // galleries hang work flat: no drop shadow
}

const BASE: Record<DossierStyle, Omit<StyleTokens, "accent" | "accentSoft">> = {
  sobrio: { paper: "#f4f4f1", ink: "#262b30", granite: "#6b7075", hair: "#c8cbc8", wall: "#d6d8d5", ground: "#e6e7e3", onInk: "#a9aeb2", inkRule: "#4a5157", display: "sans", flatFrames: false },
  editorial: { paper: "#f6f1e7", ink: "#2b2520", granite: "#6c6258", hair: "#d8cebf", wall: "#ddd5c7", ground: "#ece5d7", onInk: "#b4aa9e", inkRule: "#51483f", display: "serif", flatFrames: false },
  galeria: { paper: "#ffffff", ink: "#141517", granite: "#5d6166", hair: "#dededb", wall: "#e8e8e5", ground: "#f2f2f0", onInk: "#a7abaf", inkRule: "#3d4044", display: "sans", flatFrames: true },
};

const DEFAULT_ACCENT: Record<DossierStyle, Record<ProfileKind, string>> = {
  sobrio: { creator: "#a3a05a", business: "#4f6e7d" },
  editorial: { creator: "#9a4f32", business: "#7a5a3a" },
  galeria: { creator: "#3f5f52", business: "#3f5f73" },
};

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Tames a colour taken from the artwork so it can sit on paper as an accent (rules, the call band, the
 * "just written" wash): mid lightness, never neon, never so pale it disappears.
 */
export function tameAccent(hex: string): string | undefined {
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;
  const [h, s, l] = rgbToHsl(rgb);
  return rgbToHex(hslToRgb([h, Math.min(s, 0.5), Math.min(Math.max(l, 0.3), 0.48)]));
}

export function styleTokens(style: DossierStyle, kind: ProfileKind, accentFromWork?: string): StyleTokens {
  const base = BASE[style];
  const accent = (accentFromWork && tameAccent(accentFromWork)) || DEFAULT_ACCENT[style][kind];
  const accentSoft = rgbToHex(mix(hexToRgb(accent)!, hexToRgb(base.paper)!, 0.78));
  return { ...base, accent, accentSoft };
}

/**
 * Accent colour from raw RGBA pixels of the artist's photos (canvas getImageData on the page).
 * Hue histogram weighted by saturation, so the colour that carries the work wins over neutral paper or wall.
 * Returns undefined for greyscale work: the style's own accent is kept.
 */
export function accentFromPixels(pixels: ArrayLike<number>, step = 4): string | undefined {
  const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let total = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4 * step) {
    if (pixels[i + 3] < 128) continue;
    const rgb: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    total++;
    if (s < 0.12 || l < 0.08 || l > 0.94) continue;
    const w = s * (1 - Math.abs(l - 0.5));
    const bin = bins[Math.floor(h / 30) % 12];
    bin.w += w;
    bin.r += rgb[0] * w;
    bin.g += rgb[1] * w;
    bin.b += rgb[2] * w;
  }
  const top = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (!total || top.w / total < 0.03) return undefined;
  return rgbToHex([top.r / top.w, top.g / top.w, top.b / top.w]);
}

/** Up to `n` distinct dominant colours of the work (one per hue family), strongest first. */
export function paletteFromPixels(pixels: ArrayLike<number>, n = 3, step = 1): string[] {
  const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i + 3 < pixels.length; i += 4 * step) {
    if (pixels[i + 3] < 128) continue;
    const rgb: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    if (s < 0.12 || l < 0.08 || l > 0.94) continue;
    const w = s * (1 - Math.abs(l - 0.5));
    const bin = bins[Math.floor(h / 30) % 12];
    bin.w += w;
    bin.r += rgb[0] * w;
    bin.g += rgb[1] * w;
    bin.b += rgb[2] * w;
  }
  return bins
    .filter((b) => b.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, n)
    .map((b) => rgbToHex([b.r / b.w, b.g / b.w, b.b / b.w]));
}
