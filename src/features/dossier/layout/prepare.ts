/**
 * Deterministic guard of a free layout, run before ANY renderer paints it (and again at every render, so a
 * deleted work or an edited text can never leave a broken page). Server-only (measures text with the real fonts).
 *
 *  - every text comes from the artist's catalog (ref) or is a verbatim excerpt of it (quote); anything else is dropped
 *  - every image is one of the artist's own works, by number; never anything else
 *  - text stays inside the printable area; images and rectangles may bleed to the page edge
 *  - text that does not fit its box is shrunk, then the box grows, then it continues on an extra page: never cut
 *  - texts, and text and photos, never overlap (except a deliberate caption over a photo, which gets a band to stay legible)
 *  - minimum contrast between text and what is behind it
 *  - photos never deformed (cover only when little would be cropped, else contain)
 *  - at most MAX_PAGES pages and MAX_ELEMENTS elements
 * Anything it cannot repair throws LayoutError: the caller falls back to the template and says so.
 */
import { ensureContrast, contrast } from "../design";
import { hexToRgb, rgbToHex } from "../style";
import { isVerbatim, type Catalog } from "./catalog";
import { PARA_GAP_EM, resolveRender, textHeight, textWidth, wrapParagraph, type TextStyleForMeasure } from "./measure";
import { snapFace } from "./fonts";
import {
  FreeLayout,
  MAX_ELEMENTS,
  MAX_PAGES,
  PAGE_H_PT,
  PAGE_W_PT,
  type LayoutElement,
  type PreparedElement,
  type PreparedEllipse,
  type PreparedImage,
  type PreparedLine,
  type PreparedLayout,
  type PreparedPage,
  type PreparedRect,
  type PreparedText,
} from "./schema";

export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutError";
  }
}

export const SAFE_X = 6; // % of the width kept free of text
export const SAFE_Y = 5; // % of the height
const WIDTH_SLACK = 0.96; // measure against 96% of the box: the PDF engine may break a hair differently
const HEIGHT_SLACK = 1.03;

export interface PrepareResult {
  layout: PreparedLayout;
  adjustments: string[]; // Spanish: what the guard changed and why
  missingWorks: boolean; // the layout asked for works the artist has not uploaded
}

type Box = { x: number; y: number; w: number; h: number };
type Item = { z: number; seq: number; el: PreparedElement; col?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const wPt = (pct: number) => (pct / 100) * PAGE_W_PT;
const hPt = (pct: number) => (pct / 100) * PAGE_H_PT;
const toPctY = (pt: number) => (pt / PAGE_H_PT) * 100;

function blend(fg: string, bg: string, a: number): string {
  const f = hexToRgb(fg) ?? [0, 0, 0];
  const b = hexToRgb(bg) ?? [255, 255, 255];
  return rgbToHex([f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a)]);
}
const lum = (hex: string) => contrast(hex, "#000000") / 21; // monotonic in relative luminance, enough to pick a side

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const styleOf = (t: PreparedText, size = t.size): TextStyleForMeasure => ({ family: t.renderFamily, weight: t.weight, italic: t.italic, size, tracking: t.tracking, uppercase: t.uppercase });
const usableWidth = (t: Pick<PreparedText, "w">) => wPt(t.w) * WIDTH_SLACK;
const needHeight = (t: PreparedText, paragraphs: string[], size: number) => textHeight(paragraphs, usableWidth(t), styleOf(t, size), t.lineHeight).height * HEIGHT_SLACK;

/** Bounding box (in % of the page) of a box turned `deg` degrees around its centre. */
function rotatedBox(b: Box, deg: number): Box {
  if (!deg || deg % 180 === 0) return b;
  const t = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const sn = Math.abs(Math.sin(t));
  const w = wPt(b.w);
  const h = hPt(b.h);
  const bw = w * c + h * sn;
  const bh = w * sn + h * c;
  const cx = wPt(b.x) + w / 2;
  const cy = hPt(b.y) + h / 2;
  return { x: ((cx - bw / 2) / PAGE_W_PT) * 100, y: ((cy - bh / 2) / PAGE_H_PT) * 100, w: (bw / PAGE_W_PT) * 100, h: (bh / PAGE_H_PT) * 100 };
}

/** Where the text really sits inside its box (box heights are generous; overlap is judged on the used part), turned if rotated. */
function extentOf(t: PreparedText): Box {
  const used = Math.min(hPt(t.h), needHeight(t, t.paragraphs, t.size));
  const usedPct = toPctY(used);
  const y = t.valign === "top" ? t.y : t.valign === "middle" ? t.y + (t.h - usedPct) / 2 : t.y + t.h - usedPct;
  return rotatedBox({ x: t.x, y, w: t.w, h: usedPct }, t.rotate);
}

/** Splits paragraphs so that the first part fits `maxHeightPt`; the rest continues on the next page. */
function fillBox(paragraphs: string[], t: PreparedText, size: number, maxHeightPt: number): { fit: string[]; rest: string[] } {
  const st = styleOf(t, size);
  const lineH = size * t.lineHeight * HEIGHT_SLACK;
  const gap = PARA_GAP_EM * size;
  const fit: string[] = [];
  const rest: string[] = [];
  let used = 0;
  let full = false;
  for (const p of paragraphs) {
    if (full) {
      rest.push(p);
      continue;
    }
    const lines = wrapParagraph(p, usableWidth(t), st);
    let k = 0;
    const g = fit.length ? gap : 0;
    while (k < lines.length && used + g * (k === 0 ? 1 : 0) + lineH <= maxHeightPt) {
      used += lineH + (k === 0 ? g : 0);
      k++;
    }
    if (k > 0) fit.push(lines.slice(0, k).join(" "));
    if (k < lines.length) {
      rest.push(lines.slice(k).join(" "));
      full = true;
    }
  }
  return { fit, rest };
}

interface Working {
  background: string;
  items: Item[];
}

export function prepareLayout(input: FreeLayout, catalog: Catalog): PrepareResult {
  const parsed = FreeLayout.safeParse(input);
  if (!parsed.success) throw new LayoutError("La maquetación no tiene el formato esperado.");
  const adjustments = new Set<string>();
  const note = (s: string) => adjustments.add(s);
  let missingWorks = false;
  let seq = 0;
  let textsSeen = 0;
  let textsDropped = 0;
  let elementCount = 0;

  const pages: Working[] = [];

  // ---------------------------------------------------------------- A: resolve and clamp
  for (const page of parsed.data.pages) {
    const w: Working = { background: page.background, items: [] };
    for (const el of page.elements) {
      if (elementCount >= MAX_ELEMENTS) {
        note("Había demasiados elementos y he quitado los últimos.");
        break;
      }
      const col = el.type === "text" && (el.columns ?? 1) > 1 && !el.rotate ? `col${seq}` : undefined;
      for (const item of [resolveElement(el)].flat()) {
        if (!item) continue;
        w.items.push({ z: el.z ?? 0, seq: seq++, el: item, col });
        elementCount++;
      }
    }
    pages.push(w);
  }

  function resolveElement(el: LayoutElement): PreparedElement | PreparedElement[] | undefined {
    if (el.type === "rect") {
      const b = bleedBox(el, 0.1);
      return b ? { type: "rect", ...b, fill: el.fill, opacity: el.opacity, radiusPct: el.radius ?? 0, stroke: el.stroke, strokeWidth: el.stroke ? (el.strokeWidth ?? 1) : 0 } : undefined;
    }
    if (el.type === "ellipse") {
      const b = bleedBox(el, 0.5);
      if (!b) return undefined;
      const e: PreparedEllipse = { type: "ellipse", ...b, fill: el.fill, stroke: el.stroke, strokeWidth: el.stroke ? (el.strokeWidth ?? 1) : 0, opacity: el.opacity };
      return e.fill || e.stroke ? e : undefined;
    }
    if (el.type === "line") {
      const q = (n: number) => r2(clamp(n, 0, 100));
      const l: PreparedLine = { type: "line", x1: q(el.x1), y1: q(el.y1), x2: q(el.x2), y2: q(el.y2), width: el.width, color: el.color, opacity: el.opacity, dashed: !!el.dashed };
      if (Math.hypot(wPt(l.x2 - l.x1), hPt(l.y2 - l.y1)) < 2) return undefined;
      if (l.x1 !== el.x1 || l.y1 !== el.y1 || l.x2 !== el.x2 || l.y2 !== el.y2) note("He recortado a los bordes de la página lo que se salía.");
      return l;
    }
    if (el.type === "image") {
      const work = catalog.works[el.work - 1];
      if (!work) {
        missingWorks = true;
        note(`He quitado una foto de la obra ${el.work}: no la tienes subida. Sube más fotos en Obra y la coloco.`);
        return undefined;
      }
      const b = bleedBox(el, 3);
      if (!b) return undefined;
      const matPct = el.frame === "mat" ? clamp(el.matSize, 0, 15) : 0;
      return { type: "image", ...b, workId: work.id, url: work.imageUrl, alt: work.title, fit: el.fit, focus: el.focus ?? { x: 0.5, y: 0.5 }, frame: el.frame, mat: el.mat ?? "", matPct, lineColor: "", radiusPct: el.radius ?? 0, opacity: el.opacity ?? 1 };
    }
    // text
    textsSeen++;
    let paragraphs: string[] | undefined;
    if (el.ref) paragraphs = catalog.texts[el.ref]?.paragraphs;
    if (!paragraphs && el.quote) {
      if (isVerbatim(el.quote, catalog)) paragraphs = [el.quote.replace(/\s+/g, " ").trim()];
      else note("He quitado una cita que no estaba en lo que me contaste: solo uso tus palabras.");
    } else if (!paragraphs && el.ref) {
      note("He quitado un texto que no existe en tu dossier.");
    }
    if (!paragraphs?.length) {
      textsDropped++;
      return undefined;
    }
    const snapped = snapFace(el.family, el.weight, el.italic);
    const render = resolveRender(el.family, el.weight, el.italic);
    const rot = Math.abs(el.rotate ?? 0) < 0.5 ? 0 : (el.rotate ?? 0);
    const columns = rot ? 1 : (el.columns ?? 1);
    if (rot && (el.columns ?? 1) > 1) note("El texto girado va en una sola columna.");
    const base: PreparedText = {
      type: "text",
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      paragraphs: [...paragraphs],
      family: el.family,
      weight: snapped.weight,
      italic: snapped.italic,
      renderFamily: render.renderFamily,
      size: el.size,
      lineHeight: el.lineHeight,
      align: el.align,
      valign: el.valign,
      color: el.color,
      opacity: el.opacity,
      uppercase: el.uppercase,
      tracking: el.tracking,
      rotate: rot,
    };
    if (rot) return { ...base, ...safeRotatedBox(el, rot) };
    const b = safeBox(el);
    if (columns <= 1) return { ...base, ...b };
    const gap = clamp(el.gap ?? 3, 0, 15);
    const colW = (b.w - gap * (columns - 1)) / columns;
    if (colW < 8) return { ...base, ...b };
    return Array.from({ length: columns }, (_, i) => ({ ...base, paragraphs: [...paragraphs], x: r2(b.x + i * (colW + gap)), y: b.y, w: r2(colW), h: b.h }));
  }

  /** A turned text keeps its whole turned shape inside the printable area: scaled down if it is too big, then moved in. */
  function safeRotatedBox(b: Box, deg: number): Box {
    const minX = (SAFE_X / 100) * PAGE_W_PT;
    const minY = (SAFE_Y / 100) * PAGE_H_PT;
    const maxW = PAGE_W_PT - 2 * minX;
    const maxH = PAGE_H_PT - 2 * minY;
    let w = wPt(clamp(b.w, 2, 300));
    let h = hPt(clamp(b.h, 1, 300));
    const t = (deg * Math.PI) / 180;
    const c = Math.abs(Math.cos(t));
    const sn = Math.abs(Math.sin(t));
    const bw = w * c + h * sn;
    const bh = w * sn + h * c;
    const k = Math.min(1, maxW / bw, maxH / bh);
    if (k < 1) {
      w *= k;
      h *= k;
      note("He metido los textos en la zona imprimible de la página.");
    }
    const aw = w * c + h * sn;
    const ah = w * sn + h * c;
    let cx = wPt(b.x) + wPt(clamp(b.w, 2, 300)) / 2;
    let cy = hPt(b.y) + hPt(clamp(b.h, 1, 300)) / 2;
    const ncx = clamp(cx, minX + aw / 2, PAGE_W_PT - minX - aw / 2);
    const ncy = clamp(cy, minY + ah / 2, PAGE_H_PT - minY - ah / 2);
    if (Math.abs(ncx - cx) > 4 || Math.abs(ncy - cy) > 4) note("He metido los textos en la zona imprimible de la página.");
    cx = ncx;
    cy = ncy;
    return { x: r2(((cx - w / 2) / PAGE_W_PT) * 100), y: r2(((cy - h / 2) / PAGE_H_PT) * 100), w: r2((w / PAGE_W_PT) * 100), h: r2((h / PAGE_H_PT) * 100) };
  }

  /** Images and rectangles may bleed: clipped to the page, not moved. */
  function bleedBox(b: Box, min: number): Box | undefined {
    const x0 = clamp(b.x, 0, 100);
    const y0 = clamp(b.y, 0, 100);
    const x1 = clamp(b.x + b.w, 0, 100);
    const y1 = clamp(b.y + b.h, 0, 100);
    if (x1 - x0 < min || y1 - y0 < min) {
      note("He quitado un elemento que quedaba fuera de la página.");
      return undefined;
    }
    if (x0 !== b.x || y0 !== b.y || x1 - x0 !== b.w || y1 - y0 !== b.h) note("He recortado a los bordes de la página lo que se salía.");
    return { x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0) };
  }

  /** Text is moved inside the printable area (it is never printed to the very edge). */
  function safeBox(b: Box): Box {
    const w = clamp(b.w, 4, 100 - 2 * SAFE_X);
    const h = clamp(b.h, 2, 100 - 2 * SAFE_Y);
    const x = clamp(b.x, SAFE_X, 100 - SAFE_X - w);
    const y = clamp(b.y, SAFE_Y, 100 - SAFE_Y - h);
    if (Math.abs(x - b.x) > 0.5 || Math.abs(y - b.y) > 0.5 || Math.abs(w - b.w) > 0.5 || Math.abs(h - b.h) > 0.5) note("He metido los textos en la zona imprimible de la página.");
    return { x: r2(x), y: r2(y), w: r2(w), h: r2(h) };
  }

  // ---------------------------------------------------------------- A2: one text is never shown twice
  // A "columns" text, or the same long text in several boxes of a page, flows from one box to the next (balanced for
  // "columns"). The same long text on a later page is dropped.
  const isLong = (t: PreparedText) => t.paragraphs.join(" ").length > 200;
  const seenLong = new Set<string>();
  for (const page of pages) {
    const groups = new Map<string, Item[]>();
    for (const it of page.items) {
      if (it.el.type !== "text") continue;
      if (!it.col && !isLong(it.el)) continue;
      const key = it.col ?? it.el.paragraphs.join("\n");
      if (!it.col && seenLong.has(key) && !groups.has(key)) {
        page.items = page.items.filter((o) => o !== it);
        note("He quitado un texto largo repetido en otra página.");
        continue;
      }
      groups.set(key, [...(groups.get(key) ?? []), it]);
    }
    for (const [key, items] of groups) {
      seenLong.add(items[0].col ? (items[0].el as PreparedText).paragraphs.join("\n") : key);
      if (items.length < 2) continue;
      const boxes = items.map((i) => i.el as PreparedText).sort((a, b) => a.x - b.x || a.y - b.y);
      let paras = boxes[0].paragraphs;
      const size = boxes[0].size;
      const balanced = !!items[0].col;
      const total = needHeight(boxes[0], paras, size);
      const lineH = size * boxes[0].lineHeight * HEIGHT_SLACK;
      boxes.forEach((b, i) => {
        b.size = size;
        if (i === boxes.length - 1) {
          b.paragraphs = paras;
          return;
        }
        const cap = balanced ? Math.min(hPt(b.h), (total / boxes.length) * 1.08 + lineH) : hPt(b.h);
        const { fit, rest } = fillBox(paras, b, size, cap);
        b.paragraphs = fit;
        paras = rest;
      });
      const empty = boxes.filter((b) => !b.paragraphs.length);
      page.items = page.items.filter((o) => !empty.includes(o.el as PreparedText));
      note(balanced ? "El texto va repartido en columnas." : "El mismo texto en varias cajas fluye en columnas: no lo repito.");
    }
  }

  // ---------------------------------------------------------------- B..E per page (continuations are inserted as we go)
  const out: PreparedPage[] = [];
  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    // B: text overflow
    for (const it of [...page.items]) {
      if (it.el.type !== "text") continue;
      const rest = fitText(page, it);
      if (rest) {
        if (pages.length >= MAX_PAGES) throw new LayoutError(`El texto es demasiado largo para ${MAX_PAGES} páginas.`);
        const t = it.el;
        const cont: PreparedText = { ...t, paragraphs: rest, x: t.x, y: SAFE_Y, w: t.w, h: 100 - 2 * SAFE_Y, valign: "top" };
        pages.splice(pi + 1, 0, { background: page.background, items: [{ z: 0, seq: seq++, el: cont }] });
        note("Un texto era demasiado largo y sigue en la página siguiente.");
      }
    }
    // C: overlaps
    resolveOverlaps(page, pi + 1);
    // D: paint order, contrast, bands over photos
    const ordered = [...page.items].sort((a, b) => a.z - b.z || a.seq - b.seq).map((i) => i.el);
    out.push({ background: page.background, elements: finishPage(page.background, ordered) });
  }

  // ---------------------------------------------------------------- F: whole-layout checks
  const kept = out.filter((p) => p.elements.some((e) => e.type === "text" || e.type === "image"));
  if (kept.length !== out.length) note("He quitado páginas que se quedaban vacías.");
  if (!kept.length) throw new LayoutError("La maquetación no tiene nada que mostrar.");
  if (kept.length > MAX_PAGES) throw new LayoutError(`Demasiadas páginas (máximo ${MAX_PAGES}).`);
  if (textsSeen && textsDropped / textsSeen > 0.4) throw new LayoutError("Demasiados textos no se podían sacar de lo que me contaste.");

  return { layout: { name: parsed.data.name, rationale: parsed.data.rationale, pages: kept }, adjustments: [...adjustments], missingWorks };

  // ---------------------------------------------------------------- helpers (hoisted)

  /** Shrinks, grows or continues one text so it fits. Returns the paragraphs that go to a continuation page. */
  function fitText(page: Working, it: Item): string[] | undefined {
    const t = it.el as PreparedText;
    // A word wider than the box cannot be broken: shrink the type until the widest word fits the width.
    const widest = Math.max(...t.paragraphs.flatMap((p) => p.split(/\s+/)).map((w) => textWidth(w, styleOf(t))));
    if (widest > usableWidth(t)) {
      const k = (usableWidth(t) / widest) * 0.98;
      t.size = r2(Math.max(6, t.size * k));
      note("He reducido el tamaño de algún texto para que cupiera entero.");
    }
    const boxH = hPt(t.h);
    if (needHeight(t, t.paragraphs, t.size) <= boxH) return undefined;
    const chars = t.paragraphs.join(" ").length;
    if (chars > 40_000) throw new LayoutError("Un texto es demasiado largo para maquetarlo.");
    const long = chars > 220 || t.paragraphs.length > 2;
    const hardFloor = t.size > 24 ? 12 : Math.min(t.size, 8);
    const softFloor = long ? Math.max(Math.min(t.size, 8.5), t.size * 0.85) : Math.max(hardFloor, t.size * 0.75);
    const shrinkTo = (floor: number) => {
      let s = t.size;
      while (s > floor + 0.01 && needHeight(t, t.paragraphs, s) > hPt(t.h)) s = Math.max(floor, s * 0.94);
      return s;
    };
    const original = t.size;
    let s = shrinkTo(softFloor);
    if (needHeight(t, t.paragraphs, s) > hPt(t.h)) {
      // grow the box downwards while the space below is free
      const maxBottom = 100 - SAFE_Y;
      const free = !page.items.some((o) => o.el !== t && (o.el.type === "text" || o.el.type === "image") && overlapArea({ x: t.x, y: t.y + t.h, w: t.w, h: maxBottom - (t.y + t.h) }, o.el) > 0);
      if (free && t.y + t.h < maxBottom) t.h = r2(maxBottom - t.y);
    }
    if (needHeight(t, t.paragraphs, s) > hPt(t.h) && !long) s = shrinkTo(hardFloor);
    if (needHeight(t, t.paragraphs, s) <= hPt(t.h)) {
      t.size = r2(s);
      if (t.size < original - 0.05) note("He reducido el tamaño de algún texto para que cupiera entero.");
      return undefined;
    }
    if (!long) throw new LayoutError("Un texto no cabe ni en su tamaño mínimo.");
    t.size = r2(s);
    const { fit, rest } = fillBox(t.paragraphs, t, s, hPt(t.h));
    if (!fit.length) throw new LayoutError("Un texto largo no tiene sitio ni para una línea.");
    t.paragraphs = fit;
    return rest.length ? rest : undefined;
  }

  function resolveOverlaps(page: Working, pageNo: number) {
    const texts = () => page.items.map((i) => i.el).filter((e): e is PreparedText => e.type === "text");
    const images = page.items.map((i) => i.el).filter((e): e is PreparedImage => e.type === "image");
    for (let i = 0; i < images.length; i++)
      for (let j = i + 1; j < images.length; j++) {
        const a = overlapArea(images[i], images[j]);
        if (a > 0.01 * Math.min(images[i].w * images[i].h, images[j].w * images[j].h)) throw new LayoutError(`Dos fotos se solapan en la página ${pageNo}.`);
      }
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      // text over a photo: a caption fully inside it is deliberate; a partial overlap is moved out
      for (const t of texts()) {
        const ext = extentOf(t);
        for (const img of images) {
          const a = overlapArea(ext, img);
          if (a <= 0 || a >= 0.9 * ext.w * ext.h) continue;
          const below = ext.y + ext.h / 2 >= img.y + img.h / 2;
          const newTop = below ? img.y + img.h + 1.5 : img.y - 1.5 - ext.h;
          const shift = newTop - ext.y;
          if (newTop < SAFE_Y || newTop + ext.h > 100 - SAFE_Y) throw new LayoutError(`Un texto pisa una foto en la página ${pageNo} y no cabe fuera.`);
          t.y = r2(clamp(t.y + shift, SAFE_Y, 100 - SAFE_Y - t.h));
          note("He apartado un texto que tapaba una foto.");
          moved = true;
        }
      }
      // text over text: the lower one goes under the upper one
      const ts = texts().sort((a, b) => extentOf(a).y - extentOf(b).y);
      for (let i = 0; i < ts.length; i++)
        for (let j = i + 1; j < ts.length; j++) {
          const A = extentOf(ts[i]);
          const B = extentOf(ts[j]);
          if (overlapArea(A, B) <= 0.0001) continue;
          const shift = A.y + A.h + 1 - B.y;
          const b = ts[j];
          if (B.y + B.h + shift > 100 - SAFE_Y) throw new LayoutError(`Dos textos se solapan en la página ${pageNo} y no caben uno debajo de otro.`);
          b.y = r2(b.y + shift);
          if (b.y + b.h > 100 - SAFE_Y) b.h = r2(100 - SAFE_Y - b.y);
          note("He separado textos que se pisaban.");
          moved = true;
        }
      if (!moved) break;
      if (pass === 3) throw new LayoutError(`No he podido separar los textos de la página ${pageNo}.`);
    }
  }

  function finishPage(background: string, ordered: PreparedElement[]): PreparedElement[] {
    const out: PreparedElement[] = [];
    const lineColor = lum(background) > 0.4 ? "#1a1a1a" : "#e8e8e8";
    ordered.forEach((el, idx) => {
      if (el.type === "image") {
        const img = el as PreparedImage;
        img.mat = img.mat || background;
        img.lineColor = lineColor;
        const work = catalog.works.find((w) => w.id === img.workId);
        if (img.fit === "cover" && work?.ratio) {
          const short = Math.min(wPt(img.w), hPt(img.h));
          const pad = (img.matPct / 100) * short;
          const rb = Math.max(1, wPt(img.w) - 2 * pad) / Math.max(1, hPt(img.h) - 2 * pad);
          if (Math.min(rb / work.ratio, work.ratio / rb) < 0.62) {
            img.fit = "contain";
            note("He ajustado una foto para que se vea entera en vez de recortarla demasiado.");
          }
        }
        out.push(img);
        return;
      }
      if (el.type !== "text") {
        out.push(el);
        return;
      }
      const t = el as PreparedText;
      const ext = extentOf(t);
      let bg = background;
      let overPhoto = false;
      let photoIdx = -1;
      // Shapes under a text: fully covered -> that colour is the background; only partly covered -> the text must read on
      // both the page and the shape, which no single colour guarantees, so it gets a band like text over a photo.
      let shapeConflict = false;
      ordered.slice(0, idx).forEach((below) => {
        if (below.type !== "ellipse" || !below.fill || below.opacity < 0.3) return;
        const inner: Box = { x: below.x + below.w * 0.146, y: below.y + below.h * 0.146, w: below.w * 0.708, h: below.h * 0.708 }; // rectangle inscribed in the ellipse
        if (overlapArea(ext, inner) >= 0.98 * ext.w * ext.h) bg = blend(below.fill, bg, below.opacity);
        else if (overlapArea(ext, below) > 0.02 * ext.w * ext.h) shapeConflict = true;
      });
      ordered.slice(0, idx).forEach((below, k) => {
        if (below.type === "rect" && overlapArea(ext, below) >= 0.5 * ext.w * ext.h) bg = blend(below.fill, bg, below.opacity);
        else if (below.type === "rect" && below.opacity >= 0.3 && overlapArea(ext, below) > 0.02 * ext.w * ext.h && overlapArea(ext, below) < 0.98 * ext.w * ext.h) shapeConflict = true;
        if (below.type === "image" && overlapArea(ext, below) > 0.02 * ext.w * ext.h && photoIdx < 0) (overPhoto = true), (photoIdx = k);
      });
      // A colour veil over the photo (rects above it that cover the text) makes the band unnecessary when the text
      // still reads against the veil over both a black and a white picture.
      let veiled = false;
      if (overPhoto) {
        const veils = ordered.slice(photoIdx + 1, idx).filter((r): r is PreparedRect => r.type === "rect" && r.opacity >= 0.3 && overlapArea(ext, r) >= 0.9 * ext.w * ext.h);
        if (veils.length) {
          const worst = ["#000000", "#ffffff"].map((b0) => veils.reduce((acc, v) => blend(v.fill, acc, v.opacity), b0));
          const min0 = t.size >= 24 ? 3 : 4.5;
          if (worst.every((b0) => contrast(blend(t.color, b0, t.opacity), b0) >= min0)) {
            veiled = true;
            bg = worst[0];
          }
        }
      }
      if (shapeConflict && !overPhoto) {
        // the band keeps the text legible over a shape that only covers part of it
        const bandFill = lum(t.color) > 0.5 ? "#000000" : "#ffffff";
        out.push({ type: "rect", x: r2(Math.max(0, ext.x - 1.5)), y: r2(Math.max(0, ext.y - 0.8)), w: r2(Math.min(100 - Math.max(0, ext.x - 1.5), ext.w + 3)), h: r2(Math.min(100, ext.h + 1.6)), fill: bandFill, opacity: 0.8, radiusPct: 0, strokeWidth: 0 });
        bg = blend(bandFill, "#808080", 0.8);
        note("He puesto una banda tras un texto que quedaba a medias sobre una forma de color, para que se lea.");
      }
      if (overPhoto && !veiled) {
        // text on a photo: a band behind it, so legibility never depends on the picture
        const bandFill = lum(t.color) > 0.5 ? "#000000" : "#ffffff";
        const band: PreparedRect = { type: "rect", x: r2(Math.max(0, ext.x - 1.5)), y: r2(Math.max(0, ext.y - 0.8)), w: r2(Math.min(100 - Math.max(0, ext.x - 1.5), ext.w + 3)), h: r2(Math.min(100, ext.h + 1.6)), fill: bandFill, opacity: 0.62, radiusPct: 0, strokeWidth: 0 };
        out.push(band);
        bg = blend(bandFill, "#808080", 0.62);
        note("He puesto una banda tras el texto que va sobre una foto, para que se lea.");
      }
      const min = t.size >= 24 ? 3 : 4.5;
      const eff = blend(t.color, bg, t.opacity);
      if (contrast(eff, bg) < min) {
        t.color = ensureContrast(t.color, bg, min);
        t.opacity = 1;
        note("He dado más contraste a un texto para que se lea bien.");
      }
      out.push(t);
    });
    return out;
  }
}
