/**
 * Dossier design: the open description the design agent writes from what the artist asks for
 * ("como una noche en el puerto", "que parezca un fanzine"). Palette, any Google Font, cover and works
 * layout, framing, rhythm and section titles in the artist's own voice.
 * `guardDesign` keeps whatever comes back legible and printable, and tells the artist what it changed.
 * Pure module: shared by the page, the PDF, the agent and its mock.
 */
import { z } from "zod";
import type { Call, ProfileKind } from "@/contracts";
import { hexToRgb, rgbToHex, styleTokens, type DossierStyle, type StyleTokens } from "./style";

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "hex #rrggbb");
/** Any Google Fonts family name. Unknown families fall back to the category's bundled face. */
export const FontFamily = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/, "Google Fonts family name");
export const FontCategory = z.enum(["serif", "sans", "mono", "display", "handwriting"]);
export type FontCategory = z.infer<typeof FontCategory>;

export const SECTION_TITLE_KEYS = ["statement", "bio", "works", "cv", "contact", "activity", "team", "projects", "figures"] as const;
export type SectionTitleKey = (typeof SECTION_TITLE_KEYS)[number];

export const DEFAULT_TITLES: Record<SectionTitleKey, string> = {
  statement: "Statement",
  bio: "Biografía",
  works: "Obra",
  cv: "Trayectoria",
  contact: "Contacto",
  activity: "Actividad",
  team: "Equipo",
  projects: "Proyectos",
  figures: "Cifras",
};

const Title = z.string().min(1).max(40);

export const DossierDesign = z.object({
  name: z.string().min(1).max(60), // short name for this look, e.g. "Noche en el puerto"
  rationale: z.string().max(600), // Spanish, tuteo: why this look, for this artist and this call
  palette: z.object({
    paper: Hex, // page background
    ink: Hex, // main text
    muted: Hex, // secondary text (captions, years)
    rule: Hex, // hairlines
    wall: Hex, // screen backdrop behind the sheets
    ground: Hex, // mat behind a work
    accent: Hex, // the one colour that marks: call band, highlights
    backPaper: Hex, // back cover (contact) background
    backInk: Hex, // back cover text
  }),
  type: z.object({
    display: z.object({
      family: FontFamily,
      category: FontCategory,
      weight: z.number().int().min(100).max(900),
      italic: z.boolean(),
      tracking: z.number().min(-0.06).max(0.2), // em
      uppercase: z.boolean(),
    }),
    body: z.object({ family: FontFamily, category: z.enum(["serif", "sans", "mono"]), scale: z.number().min(0.85).max(1.2) }),
    labels: z.enum(["display", "body"]), // face for rails, captions and years
  }),
  cover: z.object({
    layout: z.enum(["obra-arriba", "obra-a-sangre", "nombre-primero", "partida"]),
    nameScale: z.number().min(0.5).max(1.3),
  }),
  works: z.object({
    layout: z.enum(["cartela-lateral", "cartela-debajo", "rejilla"]),
    frame: z.enum(["paspartu", "plana", "sombra", "marco-fino"]),
  }),
  rhythm: z.object({
    density: z.enum(["aireada", "normal", "compacta"]),
    rules: z.enum(["finas", "gruesas", "ninguna"]),
    corners: z.number().min(0).max(16), // px radius of frames and the call band
    texture: z.enum(["ninguna", "grano", "papel"]),
  }),
  titles: z
    .object({
      statement: Title.optional(),
      bio: Title.optional(),
      works: Title.optional(),
      cv: Title.optional(),
      contact: Title.optional(),
      activity: Title.optional(),
      team: Title.optional(),
      projects: Title.optional(),
      figures: Title.optional(),
    })
    .default({}),
});
export type DossierDesign = z.infer<typeof DossierDesign>;

// ---------------------------------------------------------------- starting points

export function presetDesign(style: DossierStyle, kind: ProfileKind, accent?: string): DossierDesign {
  const t = styleTokens(style, kind, accent);
  const palette = { paper: t.paper, ink: t.ink, muted: t.granite, rule: t.hair, wall: t.wall, ground: t.ground, accent: t.accent, backPaper: t.ink, backInk: t.paper };
  const sans = { family: "Schibsted Grotesk", category: "sans" as const };
  const serif = { family: "Newsreader", category: "serif" as const };
  if (style === "editorial")
    return {
      name: "Editorial",
      rationale: "Papel cálido y títulos con serifa, como un libro.",
      palette,
      type: { display: { ...serif, weight: 400, italic: false, tracking: -0.02, uppercase: false }, body: { ...serif, scale: 1 }, labels: "body" },
      cover: { layout: "obra-arriba", nameScale: 1 },
      works: { layout: "cartela-lateral", frame: "paspartu" },
      rhythm: { density: "normal", rules: "finas", corners: 0, texture: "ninguna" },
      titles: {},
    };
  if (style === "galeria")
    return {
      name: "Galería",
      rationale: "Fondo blanco y la obra grande, como en una sala.",
      palette,
      type: { display: { ...sans, weight: 600, italic: false, tracking: -0.035, uppercase: false }, body: { ...serif, scale: 1 }, labels: "display" },
      cover: { layout: "obra-arriba", nameScale: 1 },
      works: { layout: "cartela-lateral", frame: "plana" },
      rhythm: { density: "aireada", rules: "finas", corners: 0, texture: "ninguna" },
      titles: {},
    };
  return {
    name: "Sobrio",
    rationale: "Pizarra y papel, letra de palo. Claro y ordenado.",
    palette,
    type: { display: { ...sans, weight: 500, italic: false, tracking: -0.04, uppercase: false }, body: { ...serif, scale: 1 }, labels: "display" },
    cover: { layout: "obra-arriba", nameScale: 1 },
    works: { layout: "cartela-lateral", frame: "sombra" },
    rhythm: { density: "normal", rules: "finas", corners: 0, texture: "ninguna" },
    titles: {},
  };
}

// ---------------------------------------------------------------- guard rails

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)!.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Moves `fg` towards black or white (whichever side of `bg` it is on) until it reaches `min` contrast. */
export function ensureContrast(fg: string, bg: string, min: number): string {
  if (contrast(fg, bg) >= min) return fg;
  const target: [number, number, number] = luminance(bg) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  const from = hexToRgb(fg)!;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = rgbToHex([from[0] + (target[0] - from[0]) * t, from[1] + (target[1] - from[1]) * t, from[2] + (target[2] - from[2]) * t]);
    if (contrast(c, bg) >= min) return c;
  }
  return rgbToHex(target);
}

/** Calls read by an administrative commission: legibility first, no novelty faces for the text. */
export function isStrictCall(call?: Call): boolean {
  return !!call && (call.type === "ayuda" || call.type === "subvencion");
}

export interface GuardResult {
  design: DossierDesign;
  adjustments: string[]; // Spanish, what we changed and why
}

export function guardDesign(input: DossierDesign, ctx: { call?: Call } = {}): GuardResult {
  const d: DossierDesign = structuredClone(input);
  const adjustments: string[] = [];
  const p = d.palette;

  const ink = ensureContrast(p.ink, p.paper, 7);
  if (ink !== p.ink) adjustments.push("He oscurecido el texto principal para que se lea bien impreso y proyectado.");
  p.ink = ink;
  const muted = ensureContrast(p.muted, p.paper, 4.5);
  if (muted !== p.muted) adjustments.push("He dado más contraste a los textos secundarios (cartelas, años).");
  p.muted = muted;
  p.rule = ensureContrast(p.rule, p.paper, 1.25);
  const backInk = ensureContrast(p.backInk, p.backPaper, 7);
  if (backInk !== p.backInk) adjustments.push("He ajustado el texto de la contraportada para que se lea.");
  p.backInk = backInk;
  p.accent = ensureContrast(p.accent, p.paper, 1.6);

  if (d.type.body.category !== "serif" && d.type.body.category !== "sans" && d.type.body.category !== "mono") d.type.body.category = "serif";
  if (isStrictCall(ctx.call)) {
    if (d.type.display.category === "handwriting") {
      d.type.display = { ...d.type.display, family: "Newsreader", category: "serif" };
      adjustments.push("Para una ayuda pública he cambiado la letra manuscrita de los títulos por una serifa clara.");
    }
    if (d.type.body.category === "mono") {
      d.type.body = { ...d.type.body, family: "Newsreader", category: "serif" };
      adjustments.push("El texto corrido va en serifa: la comisión lee mucho y rápido.");
    }
  }
  return { design: d, adjustments };
}

// ---------------------------------------------------------------- fonts

const FALLBACK: Record<FontCategory, { family: string; stack: string }> = {
  serif: { family: "Newsreader", stack: '"Newsreader", "Iowan Old Style", Georgia, serif' },
  sans: { family: "Schibsted Grotesk", stack: '"Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif' },
  mono: { family: "Schibsted Grotesk", stack: 'ui-monospace, "SFMono-Regular", Menlo, monospace' },
  display: { family: "Schibsted Grotesk", stack: '"Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif' },
  handwriting: { family: "Newsreader", stack: '"Newsreader", Georgia, serif' },
};

/** Families we ship as files (web and PDF): no download needed. */
export const BUNDLED_FAMILIES = new Set(["Newsreader", "Schibsted Grotesk"]);

export function fontStack(family: string, category: FontCategory): string {
  return `"${family}", ${FALLBACK[category].stack}`;
}

export function fallbackFamily(category: FontCategory): string {
  return FALLBACK[category].family;
}

/** Google Fonts stylesheet URLs for the page (one per request so a missing weight never blocks the regular). */
export function googleFontUrls(design: DossierDesign): string[] {
  const out = new Set<string>();
  for (const f of [design.type.display.family, design.type.body.family]) {
    if (BUNDLED_FAMILIES.has(f)) continue;
    const fam = f.trim().replace(/ /g, "+");
    out.add(`https://fonts.googleapis.com/css2?family=${fam}&display=swap`);
    out.add(`https://fonts.googleapis.com/css2?family=${fam}:ital@1&display=swap`);
    if (f === design.type.display.family && design.type.display.weight !== 400) out.add(`https://fonts.googleapis.com/css2?family=${fam}:wght@${design.type.display.weight}&display=swap`);
  }
  return [...out];
}

// ---------------------------------------------------------------- tokens for the renderers

export function titleFor(design: DossierDesign | undefined, key: SectionTitleKey): string {
  return design?.titles?.[key] || DEFAULT_TITLES[key];
}

/** Tokens the PDF needs, from a design (colours plus faces and framing). */
export function designTokens(design: DossierDesign): StyleTokens & { design: DossierDesign } {
  const p = design.palette;
  const soft = hexToRgb(p.accent)!;
  const paper = hexToRgb(p.paper)!;
  const accentSoft = rgbToHex([soft[0] + (paper[0] - soft[0]) * 0.78, soft[1] + (paper[1] - soft[1]) * 0.78, soft[2] + (paper[2] - soft[2]) * 0.78]);
  return {
    paper: p.paper,
    ink: p.ink,
    granite: p.muted,
    hair: p.rule,
    wall: p.wall,
    ground: p.ground,
    accent: p.accent,
    accentSoft,
    onInk: ensureContrast(p.muted, p.backPaper, 4.5),
    inkRule: ensureContrast(p.rule, p.backPaper, 1.4),
    display: design.type.display.category === "serif" || design.type.display.category === "handwriting" ? "serif" : "sans",
    flatFrames: design.works.frame === "plana",
    design,
  };
}
