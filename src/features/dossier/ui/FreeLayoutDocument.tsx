"use client";
/**
 * Screen version of a prepared free layout: the same boxes as the PDF, in percentages of an A4 sheet.
 * Type is sized with container query units so a sheet looks the same at any width (full size or thumbnail).
 */
import type { CSSProperties } from "react";
import { FONT_TABLE, googleFontUrlsFor } from "../layout/fonts";
import type { PreparedElement, PreparedLayout, PreparedText } from "../layout/schema";
import { PAGE_H_PT, PAGE_W_PT } from "../layout/schema";

const PARA_GAP_EM = 0.55;
const cq = (pt: number) => `${(pt / PAGE_W_PT) * 100}cqw`;

function stack(t: PreparedText): string {
  if (t.renderFamily === "Newsreader") return "var(--font-dossier-serif), Georgia, serif";
  if (t.renderFamily === "Schibsted Grotesk") return "var(--font-dossier-sans), 'Helvetica Neue', Arial, sans-serif";
  const cat = FONT_TABLE[t.renderFamily].category;
  const generic = cat === "mono" ? "ui-monospace, monospace" : cat === "sans" ? "'Helvetica Neue', Arial, sans-serif" : cat === "handwriting" ? "cursive" : "Georgia, serif";
  return `'${t.renderFamily}', ${generic}`;
}

/** Google Fonts stylesheets for the non-bundled faces a prepared layout paints. */
export function layoutFontUrls(layouts: PreparedLayout[]): string[] {
  const faces: { family: PreparedText["renderFamily"]; weight: number; italic: boolean }[] = [];
  for (const l of layouts) for (const p of l.pages) for (const e of p.elements) if (e.type === "text") faces.push({ family: e.renderFamily, weight: e.weight, italic: e.italic });
  return googleFontUrlsFor(faces);
}

function Item({ el }: { el: PreparedElement }) {
  if (el.type === "line") {
    const x1 = (el.x1 / 100) * PAGE_W_PT;
    const y1 = (el.y1 / 100) * PAGE_H_PT;
    const x2 = (el.x2 / 100) * PAGE_W_PT;
    const y2 = (el.y2 / 100) * PAGE_H_PT;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    return (
      <div
        style={{
          position: "absolute",
          left: cq((x1 + x2) / 2 - len / 2),
          top: cq((y1 + y2) / 2 - el.width / 2),
          width: cq(len),
          height: 0,
          borderTop: `${cq(el.width)} ${el.dashed ? "dashed" : "solid"} ${el.color}`,
          opacity: el.opacity,
          transform: `rotate(${angle}deg)`,
        }}
      />
    );
  }
  const box: CSSProperties = { position: "absolute", left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` };
  const short = Math.min((el.w / 100) * PAGE_W_PT, (el.h / 100) * PAGE_H_PT);
  if (el.type === "rect")
    return <div style={{ ...box, boxSizing: "border-box", background: el.fill, opacity: el.opacity, borderRadius: cq((el.radiusPct / 100) * short), border: el.stroke ? `${cq(el.strokeWidth)} solid ${el.stroke}` : undefined }} />;
  if (el.type === "ellipse")
    return <div style={{ ...box, boxSizing: "border-box", background: el.fill, borderRadius: "50%", opacity: el.opacity, border: el.stroke ? `${cq(el.strokeWidth)} solid ${el.stroke}` : undefined }} />;
  if (el.type === "image") {
    return (
      <div
        style={{
          ...box,
          boxSizing: "border-box",
          background: el.frame === "mat" ? el.mat : undefined,
          padding: cq((el.matPct / 100) * short),
          border: el.frame === "line" ? `1px solid ${el.lineColor}` : undefined,
          borderRadius: cq((el.radiusPct / 100) * short),
          opacity: el.opacity,
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the artist's own photo, original bytes */}
        <img src={el.url} alt={el.alt} loading="lazy" decoding="async" draggable={false} style={{ width: "100%", height: "100%", objectFit: el.fit, objectPosition: `${el.focus.x * 100}% ${el.focus.y * 100}%`, display: "block" }} />
      </div>
    );
  }
  return (
    <div style={{ ...box, display: "flex", flexDirection: "column", justifyContent: el.valign === "top" ? "flex-start" : el.valign === "middle" ? "center" : "flex-end", overflow: "hidden", transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined }}>
      {el.paragraphs.map((p, i) => (
        <p
          key={i}
          style={{
            margin: 0,
            marginBottom: i < el.paragraphs.length - 1 ? `${PARA_GAP_EM}em` : 0,
            fontFamily: stack(el),
            fontWeight: el.weight,
            fontStyle: el.italic ? "italic" : "normal",
            fontSize: cq(el.size),
            lineHeight: el.lineHeight,
            letterSpacing: `${el.tracking}em`,
            textAlign: el.align,
            color: el.color,
            opacity: el.opacity,
            textTransform: el.uppercase ? "uppercase" : "none",
          }}
        >
          {p}
        </p>
      ))}
    </div>
  );
}

function Sheet({ page, label }: { page: PreparedLayout["pages"][number]; label: string }) {
  return (
    <section className="free-layout__page" style={{ background: page.background }} aria-label={label}>
      {page.elements.map((el, k) => (
        <Item key={k} el={el} />
      ))}
    </section>
  );
}

const CSS = `
  .free-layout { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 12px 48px; background: #d9d6cf; }
  .free-layout__page { position: relative; width: min(100%, 794px); aspect-ratio: 210 / 297; container-type: inline-size; box-shadow: 0 2px 18px rgba(0,0,0,.22); overflow: hidden; }
  .free-thumb { display: flex; gap: 6px; align-items: flex-start; }
  .free-thumb .free-layout__page { width: 0; flex: 1 1 0; box-shadow: 0 1px 6px rgba(0,0,0,.25); }
  @media print {
    .free-layout { display: block; padding: 0; background: none; }
    .free-layout__page { width: 210mm; height: 297mm; box-shadow: none; break-after: page; margin: 0; }
  }
`;

export function FreeLayoutDocument({ layout }: { layout: PreparedLayout }) {
  return (
    <div className="free-layout" aria-label={layout.name}>
      {layout.pages.map((pg, i) => (
        <Sheet key={i} page={pg} label={`Página ${i + 1}`} />
      ))}
      <style>{CSS}</style>
    </div>
  );
}

/** The first pages of a layout side by side, small: what the artist compares when choosing among proposals. */
export function FreeLayoutThumb({ layout, pages = 3 }: { layout: PreparedLayout; pages?: number }) {
  return (
    <div className="free-thumb" aria-hidden="true">
      {layout.pages.slice(0, pages).map((pg, i) => (
        <Sheet key={i} page={pg} label={`Página ${i + 1}`} />
      ))}
      <style>{CSS}</style>
    </div>
  );
}
