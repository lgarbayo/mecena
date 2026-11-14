/**
 * Content floor of a free layout: the guard keeps a layout readable, this keeps it a dossier.
 * A proposal (no request from the artist) must open with the artist's name, carry the statement and show
 * enough of the works; a change may drop whatever the artist asked for, but never the name.
 * Pure. Returns the problem in Spanish (it is fed back to the model on the retry), or undefined when it is fine.
 */
import { isVerbatim, type Catalog } from "./catalog";
import type { FreeLayout, LayoutElement } from "./schema";

/** Works a proposal must show at least (all of them when there are fewer). */
export const MIN_WORKS_SHOWN = 4;

const shows = (el: LayoutElement, catalog: Catalog, id: string): boolean =>
  el.type === "text" && (el.ref === id || (!!el.quote && !!catalog.texts[id] && isVerbatim(el.quote, { ...catalog, texts: { [id]: catalog.texts[id] } })));

export function missingContent(layout: FreeLayout, catalog: Catalog, opts: { request?: string } = {}): string | undefined {
  const all = layout.pages.flatMap((p) => p.elements);
  const hasName = !!catalog.texts.nombre;
  if (opts.request?.trim()) {
    if (hasName && !all.some((e) => shows(e, catalog, "nombre"))) return "Falta el nombre del artista: ponlo en alguna página (mejor en la portada).";
    return undefined;
  }
  if (hasName && !(layout.pages[0]?.elements ?? []).some((e) => shows(e, catalog, "nombre"))) return "La portada (página 1) tiene que llevar el nombre del artista.";
  if (catalog.texts.declaracion && !all.some((e) => shows(e, catalog, "declaracion"))) return "Falta la declaración artística (texto «declaracion»).";
  const known = new Set(catalog.works.map((w) => w.n));
  const shown = new Set(all.flatMap((e) => (e.type === "image" && known.has(e.work) ? [e.work] : [])));
  const need = Math.min(catalog.works.length, MIN_WORKS_SHOWN);
  if (shown.size < need) return `Enseña al menos ${need} obras distintas (ahora hay ${shown.size}); el dossier es para ver la obra.`;
  return undefined;
}
