/**
 * The order and content of a creator dossier, as the artist wants it (design.structure): which blocks go
 * between the cover and the back cover, in what order, sections of their own, and a short or full version.
 * One plan for the page and the PDF. Pure and client-safe.
 */
import { vocabFor } from "./arts";
import { DEFAULT_TITLES, type DossierDesign } from "./design";
import { paragraphs, type CreatorView } from "./model";

export type Block =
  | { kind: "statement" | "bio" | "works" | "cv"; title: string }
  | { kind: "custom"; id: string; title: string; paras: string[] };

const DEFAULT_ORDER = ["statement", "bio", "works", "cv"] as const;

function titleOf(key: "statement" | "bio" | "works" | "cv", view: CreatorView, design?: DossierDesign, override?: string): string {
  if (override?.trim()) return override.trim();
  const own = design?.titles?.[key];
  if (own) return own;
  return key === "works" ? vocabFor(view.family).works : DEFAULT_TITLES[key];
}

/** Applies the short version: one statement paragraph, no bio, four works, three lines per CV group. */
function shorten(view: CreatorView): CreatorView {
  let left = 4;
  const series = view.series
    .map((s) => {
      const works = s.works.slice(0, Math.max(0, left));
      left -= works.length;
      return { ...s, works, description: s.description.slice(0, 1) };
    })
    .filter((s) => s.works.length);
  return {
    ...view,
    statement: view.statement.slice(0, 1),
    bio: [],
    series,
    cv: view.cv.slice(0, 3).map((g) => ({ ...g, items: g.items.slice(0, 3) })),
  };
}

export function planCreator(view: CreatorView, design?: DossierDesign): { view: CreatorView; blocks: Block[] } {
  const st = design?.structure;
  const v = st?.length === "breve" ? shorten(view) : view;
  const wanted = st?.blocks.length ? st.blocks : DEFAULT_ORDER.map((key) => ({ key, title: undefined, body: undefined }));
  const blocks: Block[] = [];
  const seen = new Set<string>();
  wanted.forEach((b, i) => {
    if (b.key === "custom") {
      const paras = paragraphs(b.body);
      if (b.title && paras.length) blocks.push({ kind: "custom", id: `custom-${i}`, title: b.title, paras });
      return;
    }
    if (seen.has(b.key)) return;
    seen.add(b.key);
    blocks.push({ kind: b.key, title: titleOf(b.key, v, design, b.title) });
  });
  return { view: v, blocks };
}
