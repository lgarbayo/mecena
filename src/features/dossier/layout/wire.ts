/**
 * What the model is asked to write: a flat, lenient version of FreeLayout. The strict schema (one branch per element
 * type, hex patterns, ranges) compiles to a grammar the API refuses as "too large", so the model gets one element
 * shape with optional fields and no ranges, and `fromWire` fills the defaults and clamps every number into the range
 * FreeLayout accepts. Whatever comes out is then parsed by FreeLayout and guarded by prepareLayout as always.
 * Pure module.
 */
import { z } from "zod";
import { FONT_FAMILIES } from "./fonts";
import { FreeLayout, MAX_ELEMENTS_PER_PAGE, MAX_PAGES, type LayoutElement } from "./schema";

// The API refuses schemas with more than 24 optional properties or a very large grammar: one branch per element type,
// the essentials required and the rest optional (at most ~20 optional properties in all).
const Box = { x: z.number(), y: z.number(), w: z.number(), h: z.number() };
const WireText = z.object({
  type: z.literal("text"),
  ...Box,
  ref: z.string(), // catalog id; "" when quoting
  quote: z.string(), // verbatim quote; "" when using a ref
  family: z.enum(FONT_FAMILIES),
  weight: z.number(),
  size: z.number(),
  color: z.string(),
  align: z.enum(["left", "center", "right", "justify"]),
  italic: z.boolean().optional(),
  lineHeight: z.number().optional(),
  valign: z.enum(["top", "middle", "bottom"]).optional(),
  opacity: z.number().optional(),
  uppercase: z.boolean().optional(),
  tracking: z.number().optional(),
  rotate: z.number().optional(),
  columns: z.number().optional(),
});
const WireImage = z.object({
  type: z.literal("image"),
  ...Box,
  work: z.number(),
  fit: z.enum(["cover", "contain"]),
  focusX: z.number().optional(),
  focusY: z.number().optional(),
  frame: z.enum(["none", "mat", "line"]).optional(),
  mat: z.string().optional(),
  matSize: z.number().optional(),
});
const WireRect = z.object({ type: z.literal("rect"), ...Box, fill: z.string(), opacity: z.number(), radius: z.number().optional(), stroke: z.string().optional() });
const WireEllipse = z.object({ type: z.literal("ellipse"), ...Box, opacity: z.number(), fill: z.string().optional(), stroke: z.string().optional() });
const WireLine = z.object({ type: z.literal("line"), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), width: z.number(), color: z.string(), opacity: z.number().optional() });
const WireElement = z.discriminatedUnion("type", [WireText, WireImage, WireRect, WireEllipse, WireLine]);
export type WireElement = z.infer<typeof WireElement>;

export const WireLayout = z.object({
  name: z.string(),
  rationale: z.string(),
  pages: z.array(z.object({ background: z.string(), elements: z.array(WireElement) })),
});
export type WireLayout = z.infer<typeof WireLayout>;

const num = (n: number | undefined, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? (n as number) : d));
const HEX = /^#[0-9a-fA-F]{6}$/;
function hex(v: string | undefined, d: string): string {
  if (!v) return d;
  const s = v.trim();
  if (HEX.test(s)) return s;
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(s);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : d;
}
const optHex = (v: string | undefined) => (v && (HEX.test(v.trim()) || /^#[0-9a-fA-F]{3}$/.test(v.trim())) ? hex(v, "#000000") : undefined);

function element(e: WireElement): LayoutElement | undefined {
  if (e.type === "line") return { type: "line", x1: num(e.x1, 0, -100, 300), y1: num(e.y1, 0, -100, 300), x2: num(e.x2, 100, -100, 300), y2: num(e.y2, 0, -100, 300), width: num(e.width, 1, 0.25, 24), color: hex(e.color, "#16181a"), opacity: num(e.opacity, 1, 0.1, 1) };
  const box = { x: num(e.x, 0, -100, 300), y: num(e.y, 0, -100, 300), w: num(e.w, 10, -100, 300), h: num(e.h, 10, -100, 300) };
  switch (e.type) {
    case "text":
      return {
        type: "text",
        ...box,
        ref: e.ref?.slice(0, 60) || undefined,
        quote: e.quote?.slice(0, 400) || undefined,
        family: e.family,
        weight: Math.round(num(e.weight, 400, 100, 900)),
        italic: e.italic ?? false,
        size: num(e.size, 12, 6, 300),
        lineHeight: num(e.lineHeight, 1.35, 0.8, 2.2),
        align: e.align,
        valign: e.valign ?? "top",
        color: hex(e.color, "#16181a"),
        opacity: num(e.opacity, 1, 0.2, 1),
        uppercase: e.uppercase ?? false,
        tracking: num(e.tracking, 0, -0.06, 0.4),
        rotate: e.rotate ? num(e.rotate, 0, -180, 180) : undefined,
        columns: e.columns && e.columns > 1 ? Math.round(num(e.columns, 1, 1, 4)) : undefined,
      };
    case "image":
      return {
        type: "image",
        ...box,
        work: Math.round(num(e.work, 1, 1, 200)),
        fit: e.fit,
        focus: e.focusX !== undefined || e.focusY !== undefined ? { x: num(e.focusX, 0.5, 0, 1), y: num(e.focusY, 0.5, 0, 1) } : undefined,
        frame: e.frame ?? "none",
        mat: optHex(e.mat),
        matSize: num(e.matSize, 0, 0, 15),
      };
    case "rect":
      return { type: "rect", ...box, fill: hex(e.fill, "#000000"), opacity: num(e.opacity, 1, 0, 1), radius: e.radius === undefined ? undefined : num(e.radius, 0, 0, 50), stroke: optHex(e.stroke), strokeWidth: e.stroke ? 1 : undefined };
    case "ellipse":
      return { type: "ellipse", ...box, fill: optHex(e.fill), stroke: optHex(e.stroke), strokeWidth: e.stroke ? 1 : undefined, opacity: num(e.opacity, 1, 0, 1) };
  }
}

/** Wire layout -> the strict FreeLayout (defaults filled, numbers clamped, page and element caps applied). Throws a ZodError only if something is still not valid. */
export function fromWire(w: WireLayout): FreeLayout {
  return FreeLayout.parse({
    name: w.name.slice(0, 60) || "Maquetación",
    rationale: w.rationale.slice(0, 600),
    pages: w.pages.slice(0, MAX_PAGES).map((p) => ({ background: hex(p.background, "#ffffff"), elements: p.elements.slice(0, MAX_ELEMENTS_PER_PAGE).flatMap((e) => element(e) ?? []) })),
  });
}
