/**
 * Free layout ("maquetación libre"): the page tree the layout agent writes from what the artist asks for.
 * Not HTML and not code: a closed vocabulary of positioned elements (text, the artist's own work, rectangle),
 * validated with zod and then guarded by `prepareLayout` before any renderer paints it.
 * Coordinates are percentages of an A4 page (x/y/w/h, 0-100), so the screen and the PDF agree.
 * Pure module, safe on the client.
 */
import { z } from "zod";
import { FONT_FAMILIES, type FontFamilyName } from "./fonts";

export const PAGE_W_PT = 595.28; // A4 in PDF points
export const PAGE_H_PT = 841.89;
export const MAX_PAGES = 12;
export const MAX_ELEMENTS_PER_PAGE = 24;
export const MAX_ELEMENTS = 80;

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "hex #rrggbb");
const Pct = z.number().min(-100).max(300); // out-of-range values are clamped by the guard, not rejected
const Z = z.number().int().min(0).max(50).optional(); // stacking order; ties keep list order

const Box = { x: Pct, y: Pct, w: Pct, h: Pct, z: Z };

export const TextElement = z.object({
  type: z.literal("text"),
  ...Box,
  /** Id of a text of the artist (see catalog.ts): "nombre", "declaracion", "obra.2.titulo"… */
  ref: z.string().max(60).optional(),
  /** A pull quote: must be a verbatim excerpt of what the artist said or wrote (checked; else dropped). */
  quote: z.string().max(400).optional(),
  family: z.enum(FONT_FAMILIES), // see fonts.ts; weight and italic snap to what the family has
  weight: z.number().int().min(100).max(900),
  italic: z.boolean(),
  size: z.number().min(6).max(300), // pt on A4
  lineHeight: z.number().min(0.8).max(2.2),
  align: z.enum(["left", "center", "right", "justify"]),
  valign: z.enum(["top", "middle", "bottom"]),
  color: Hex,
  opacity: z.number().min(0.2).max(1),
  uppercase: z.boolean(),
  tracking: z.number().min(-0.06).max(0.4), // em
  rotate: z.number().min(-180).max(180).optional(), // degrees around the box centre (90 / -90 for vertical text)
  columns: z.number().int().min(1).max(4).optional(), // the text flows across this many columns inside the box
  gap: z.number().min(0).max(15).optional(), // % of the page width between columns
});
export type TextElement = z.infer<typeof TextElement>;

export const ImageElement = z.object({
  type: z.literal("image"),
  ...Box,
  /** 1-based number of one of the artist's works ("obra 2"). Never an external image. */
  work: z.number().int().min(1).max(200),
  fit: z.enum(["cover", "contain"]),
  focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(), // focal point when cover crops
  frame: z.enum(["none", "mat", "line"]), // mat = paspartú
  mat: Hex.optional(), // mat colour (default: the page colour, so it reads as air)
  matSize: z.number().min(0).max(15), // % of the box's short side
  radius: z.number().min(0).max(50).optional(), // corner radius, % of the short side (50 = ellipse)
  opacity: z.number().min(0.1).max(1).optional(),
});
export type ImageElement = z.infer<typeof ImageElement>;

export const RectElement = z.object({
  type: z.literal("rect"),
  ...Box,
  fill: Hex,
  opacity: z.number().min(0).max(1), // a colour block with opacity is a veil; a thin one is a hairline
  radius: z.number().min(0).max(50).optional(),
  stroke: Hex.optional(),
  strokeWidth: z.number().min(0).max(20).optional(),
});
export type RectElement = z.infer<typeof RectElement>;

export const EllipseElement = z.object({
  type: z.literal("ellipse"),
  ...Box,
  fill: Hex.optional(),
  stroke: Hex.optional(),
  strokeWidth: z.number().min(0).max(20).optional(),
  opacity: z.number().min(0).max(1),
});
export type EllipseElement = z.infer<typeof EllipseElement>;

export const LineElement = z.object({
  type: z.literal("line"),
  x1: Pct,
  y1: Pct,
  x2: Pct,
  y2: Pct, // free angle
  width: z.number().min(0.25).max(24), // pt
  color: Hex,
  opacity: z.number().min(0.1).max(1),
  dashed: z.boolean().optional(),
  z: Z,
});
export type LineElement = z.infer<typeof LineElement>;

export const LayoutElement = z.discriminatedUnion("type", [TextElement, ImageElement, RectElement, EllipseElement, LineElement]);
export type LayoutElement = z.infer<typeof LayoutElement>;

export const LayoutPage = z.object({
  background: Hex,
  elements: z.array(LayoutElement).max(MAX_ELEMENTS_PER_PAGE),
});
export type LayoutPage = z.infer<typeof LayoutPage>;

export const FreeLayout = z.object({
  name: z.string().min(1).max(60), // short name, e.g. "Foto a toda página"
  rationale: z.string().max(600), // Spanish, tuteo: what was done and why
  pages: z.array(LayoutPage).min(1).max(MAX_PAGES),
});
export type FreeLayout = z.infer<typeof FreeLayout>;

// ---------------------------------------------------------------- prepared (what the renderers paint)

export interface PreparedText {
  type: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  paragraphs: string[];
  family: FontFamilyName; // as asked
  weight: number; // snapped to what the family has
  italic: boolean;
  renderFamily: FontFamilyName; // the family really painted (a bundled stand-in when a download failed)
  size: number;
  lineHeight: number;
  align: "left" | "center" | "right" | "justify";
  valign: "top" | "middle" | "bottom";
  color: string;
  opacity: number;
  uppercase: boolean;
  tracking: number;
  rotate: number;
  /** The catalog id it shows ("obra.2.ficha"), when it comes from one (not a quote). */
  ref?: string;
}
export interface PreparedImage {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  workId: string;
  url: string;
  alt: string;
  fit: "cover" | "contain";
  focus: { x: number; y: number };
  frame: "none" | "mat" | "line";
  mat: string;
  matPct: number;
  lineColor: string;
  radiusPct: number;
  opacity: number;
}
export interface PreparedRect {
  type: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  opacity: number;
  radiusPct: number;
  stroke?: string;
  strokeWidth: number;
}
export interface PreparedEllipse {
  type: "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth: number;
  opacity: number;
}
export interface PreparedLine {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  color: string;
  opacity: number;
  dashed: boolean;
}
export type PreparedElement = PreparedText | PreparedImage | PreparedRect | PreparedEllipse | PreparedLine;

export interface PreparedPage {
  background: string;
  elements: PreparedElement[]; // already in paint order (back to front)
}
export interface PreparedLayout {
  name: string;
  rationale: string;
  pages: PreparedPage[];
}
