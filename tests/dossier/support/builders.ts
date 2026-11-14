/**
 * Test-only stand-in for the layout model (the product has no templates and no mock: without a key it falls back to
 * the template design). Builds small valid layouts from the catalog so the service, the guard and the renderers can be
 * exercised offline. Every text is a catalog ref and every image one of the artist's works.
 */
import type { Catalog } from "@/features/dossier/layout/catalog";
import type { Direction, LayoutAgentInput } from "@/features/dossier/layout/agent";
import type { FreeLayout, ImageElement, LayoutElement, LayoutPage, RectElement, TextElement } from "@/features/dossier/layout/schema";

type TextOpts = Partial<Omit<TextElement, "type" | "x" | "y" | "w" | "h" | "ref" | "quote">>;
export function text(ref: string, x: number, y: number, w: number, h: number, o: TextOpts = {}): TextElement {
  return { type: "text", ref, x, y, w, h, family: "Newsreader", weight: 400, italic: false, size: 11, lineHeight: 1.4, align: "left", valign: "top", color: "#16181a", opacity: 1, uppercase: false, tracking: 0, ...o };
}
export function quoteText(quote: string, x: number, y: number, w: number, h: number, o: TextOpts = {}): TextElement {
  return { ...text("", x, y, w, h, o), ref: undefined, quote };
}
export function image(work: number, x: number, y: number, w: number, h: number, o: Partial<Omit<ImageElement, "type" | "work" | "x" | "y" | "w" | "h">> = {}): ImageElement {
  return { type: "image", work, x, y, w, h, fit: "contain", frame: "none", matSize: 0, ...o };
}
export function rect(x: number, y: number, w: number, h: number, fill: string, opacity = 1): RectElement {
  return { type: "rect", x, y, w, h, fill, opacity };
}
export const page = (...elements: LayoutElement[]): LayoutPage => ({ background: "#ffffff", elements });
export const layout = (...pages: LayoutPage[]): FreeLayout => ({ name: "t", rationale: "t", pages });

const has = (c: Catalog, id: string) => !!c.texts[id];

/** A layout whose look depends on `variant` (0, 1, 2…): different background, family, scale and grid, so batches differ. */
export function mockComposition(c: Catalog, variant: number, name = `Dirección ${variant + 1}`): FreeLayout {
  const dark = variant % 2 === 1;
  const bg = ["#fbfaf7", "#0f1113", "#e8dcc8", "#1d2b3a"][variant % 4];
  const ink = dark || variant % 4 === 3 ? "#f2efe8" : "#16181a";
  const family = (["Newsreader", "Schibsted Grotesk", "Cormorant Garamond", "Space Grotesk"] as const)[variant % 4];
  const size = [60, 110, 40, 86][variant % 4];
  const cover: LayoutElement[] = [];
  if (c.works[0]) cover.push(image(1, variant === 1 ? 0 : 8, 0, variant === 1 ? 100 : 84, variant === 1 ? 62 : 50, { fit: "cover", focus: { x: 0.5, y: 0.4 } }));
  cover.push(text("nombre", 8, c.works[0] ? 60 : 14, 84, c.works[0] ? 22 : 40, { family, size, weight: 500, color: ink, lineHeight: 1 }));
  if (has(c, "disciplina")) cover.push(text("disciplina", 8, 86, 50, 4, { family: "Schibsted Grotesk", size: 11, color: ink, uppercase: true, tracking: 0.12 }));
  const pages: LayoutPage[] = [{ background: bg, elements: cover }];
  const prose: LayoutElement[] = [];
  if (has(c, "declaracion")) prose.push(text("declaracion", 8, 10, 84, 60, { family, size: 12, color: ink, columns: variant === 2 ? 2 : 1, gap: 4 }));
  if (has(c, "biografia")) prose.push(text("biografia", 8, 74, 84, 20, { family, size: 10, color: ink }));
  if (prose.length) pages.push({ background: bg, elements: variant === 3 ? [...prose, { type: "line", x1: 8, y1: 72, x2: 92, y2: 72, width: 0.75, color: ink, opacity: 1 }] : prose });
  for (let i = 1; i < Math.min(c.works.length, 4); i++) {
    pages.push({ background: bg, elements: [image(i + 1, 0, 0, 100, 90, { fit: "contain" }), text(`obra.${i + 1}.ficha`, 8, 93, 84, 3, { family: "Schibsted Grotesk", size: 8, color: ink })] });
  }
  return { name, rationale: `Composición de prueba ${variant + 1}.`, pages };
}

export function mockDirections(count: number): Direction[] {
  return Array.from({ length: count }, (_, i) => ({ name: `Dirección ${i + 1}`, brief: `Brief de la dirección ${i + 1}.` }));
}

/** Reads a change request the way a person would, only well enough for tests. */
export function mockChange(input: LayoutAgentInput): FreeLayout {
  const base = input.current ?? mockComposition(input.catalog, 0);
  const out = structuredClone(base);
  const q = input.request.toLowerCase();
  if (/negro/.test(q)) for (const p of out.pages) (p.background = "#0f1113"), p.elements.forEach((e) => e.type === "text" && (e.color = "#eeece6"));
  if (/solo texto/.test(q)) for (const p of out.pages) p.elements = p.elements.filter((e) => e.type !== "image");
  return { ...out, name: `${out.name} · cambio` };
}
