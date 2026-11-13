/**
 * Every art, not only painting: the family of the artist (from data/taxonomy/disciplines.json) and the
 * words the dossier uses for it. Pure and client-safe.
 * TODO(CCR-arts): switch familyOf to `artFamily` from @/contracts once feat/arts-works is merged.
 */
import disciplinesJson from "../../../data/taxonomy/disciplines.json";
import type { CvGroup } from "./model";

export type ArtFamily = "artes-visuales" | "musica" | "artes-escenicas" | "audiovisual" | "literatura" | "diseno" | "artesania" | "gestion-cultural";

interface Item {
  id: string;
  parent: string | null;
  label: { es: string; gl?: string };
  synonyms?: string[];
}
const ITEMS = (disciplinesJson as { items: Item[] }).items;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const TERMS: { term: string; family: ArtFamily }[] = ITEMS.flatMap((i) => {
  const family = (i.parent ?? i.id) as ArtFamily;
  return [i.id.replace(/-/g, " "), i.label.es, i.label.gl ?? "", ...(i.synonyms ?? [])].filter(Boolean).map((t) => ({ term: norm(t), family }));
}).sort((a, b) => b.term.length - a.term.length);

/** The family that most of the disciplines belong to; visual arts when unknown. */
export function familyOf(disciplines: string[] = []): ArtFamily {
  const votes = new Map<ArtFamily, number>();
  for (const d of disciplines) {
    const n = norm(d).replace(/-/g, " ");
    const hit = TERMS.find((t) => n === t.term || n.includes(t.term) || (t.term.length > 4 && t.term.includes(n) && n.length > 3));
    if (hit) votes.set(hit.family, (votes.get(hit.family) ?? 0) + 1);
  }
  let best: ArtFamily = "artes-visuales";
  let max = 0;
  for (const [f, n] of votes) if (n > max) [best, max] = [f, n];
  return best;
}

export interface Vocab {
  works: string; // rail over the works ("Obra", "Repertorio"…)
  workSingular: string; // "obra", "pieza", "tema"…
  series: string; // "Serie" in "Serie 1 de 2"
  cat: string; // catalogue number prefix
  photoHint: string; // empty frame
  worksHint: string; // what to tell Mecena to fill the works
  sizeLabel: "dimensions" | "duration"; // which measure matters
  cv: Partial<Record<CvGroup["key"], string>>; // CV group titles that change with the art
  credit: string; // colophon: who made the images
}

const VISUAL: Vocab = {
  works: "Obra",
  workSingular: "obra",
  series: "Serie",
  cat: "Cat.",
  photoHint: "Haz una foto de la obra",
  worksHint: "Haz una foto de cada obra y dime título, año, técnica y medidas.",
  sizeLabel: "dimensions",
  cv: {},
  credit: "Fotografías de la obra hechas por su autora o autor, sin retoques.",
};

export const VOCAB: Record<ArtFamily, Vocab> = {
  "artes-visuales": VISUAL,
  musica: {
    works: "Repertorio",
    workSingular: "tema",
    series: "Proyecto",
    cat: "Nº",
    photoHint: "Sube una foto de un concierto o la portada",
    worksHint: "Sube la portada o una foto de un concierto y dime título, año, formación y duración; enlaza la grabación.",
    sizeLabel: "duration",
    cv: { soloShows: "Conciertos y giras", groupShows: "Colaboraciones", collections: "Discografía", residencies: "Residencias y festivales" },
    credit: "Imágenes facilitadas por la artista o el artista.",
  },
  "artes-escenicas": {
    works: "Piezas",
    workSingular: "pieza",
    series: "Proyecto",
    cat: "Nº",
    photoHint: "Sube una foto de la función",
    worksHint: "Sube una foto de la función y dime título, año, disciplina, duración y dónde se estrenó; enlaza el vídeo.",
    sizeLabel: "duration",
    cv: { soloShows: "Estrenos y funciones", groupShows: "Giras y festivales", collections: "Repertorio", residencies: "Residencias de creación" },
    credit: "Fotografías de escena facilitadas por la compañía.",
  },
  audiovisual: {
    works: "Filmografía",
    workSingular: "película",
    series: "Proyecto",
    cat: "Nº",
    photoHint: "Sube un fotograma o el cartel",
    worksHint: "Sube un fotograma o el cartel y dime título, año, formato, duración y equipo; enlaza el tráiler.",
    sizeLabel: "duration",
    cv: { soloShows: "Festivales y proyecciones", groupShows: "Selecciones", collections: "Filmografía", awards: "Premios y ayudas" },
    credit: "Fotogramas y carteles facilitados por la realizadora o el realizador.",
  },
  literatura: {
    works: "Publicaciones",
    workSingular: "libro",
    series: "Proyecto",
    cat: "Nº",
    photoHint: "Sube la cubierta o una página",
    worksHint: "Sube la cubierta o una página y dime título, año, género y editorial.",
    sizeLabel: "duration",
    cv: { soloShows: "Presentaciones y lecturas", groupShows: "Antologías y colaboraciones", collections: "Obra publicada" },
    credit: "Cubiertas e imágenes facilitadas por la autora o el autor.",
  },
  diseno: { ...VISUAL, works: "Proyectos", workSingular: "proyecto", series: "Línea", cat: "Nº", photoHint: "Sube una foto del proyecto", cv: { collections: "Clientes y encargos" } },
  artesania: { ...VISUAL, works: "Piezas", workSingular: "pieza", series: "Colección", cat: "Nº", photoHint: "Haz una foto de la pieza", cv: { collections: "Piezas en colecciones" } },
  "gestion-cultural": { ...VISUAL, works: "Proyectos", workSingular: "proyecto", series: "Línea", cat: "Nº", photoHint: "Sube una imagen del proyecto", cv: { soloShows: "Proyectos comisariados", groupShows: "Colaboraciones" } },
};

export const vocabFor = (family: ArtFamily): Vocab => VOCAB[family];

/** Label for a link to a work: "Ver vídeo" / "Escuchar" / "Leer" / the domain. */
export function linkLabel(url: string): string {
  const u = url.toLowerCase();
  if (/youtube|youtu\.be|vimeo/.test(u)) return "Ver vídeo";
  if (/bandcamp|soundcloud|spotify|apple\.com\/.*music|ivoox/.test(u)) return "Escuchar";
  if (/issuu|calameo|editorial|\.pdf$/.test(u)) return "Leer";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
