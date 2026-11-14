/**
 * The catalog: everything a free layout may show. Text elements point at these ids (or quote them verbatim),
 * image elements at the artist's own works by number. Nothing else can appear on a page, so the layout agent
 * cannot invent facts or bring in someone else's pictures.
 * Pure: built from the dossier view (the same content the template shows) plus what the artist said in the interview.
 */
import type { CropSuggestion } from "@/contracts";
import { DEFAULT_TITLES } from "../design";
import { vocabFor } from "../arts";
import type { DossierView, WorkView } from "../model";
import { FONT_TABLE } from "./fonts";

export interface CatalogText {
  label: string; // short Spanish description for the agent
  paragraphs: string[];
}
export interface CatalogWork {
  n: number; // 1-based, the number the artist uses ("la obra 2")
  id: string;
  title: string;
  imageUrl: string;
  crop?: CropSuggestion;
  /** width / height of the photo as shown (after the crop); unknown when the file could not be read. */
  ratio?: number;
  /** Dominant colours of the photo (hex), for the art direction. */
  colors?: string[];
}
export interface Catalog {
  name: string;
  texts: Record<string, CatalogText>;
  works: CatalogWork[];
}

const MAX_QUOTES = 8;
const MAX_SAID = 6;

/** Sentences of 30-220 characters: candidates for a pull quote. */
export function sentencesOf(paragraphs: string[]): string[] {
  const out: string[] = [];
  for (const p of paragraphs) {
    for (const s of p.split(/(?<=[.!?…])\s+/)) {
      const t = s.trim();
      if (t.length >= 30 && t.length <= 220 && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function buildCatalog(view: DossierView, opts: { said?: string[]; ratios?: Record<string, number>; colors?: Record<string, string[]> } = {}): Catalog {
  const texts: Record<string, CatalogText> = {};
  const put = (id: string, label: string, paragraphs: (string | undefined)[]) => {
    const ps = paragraphs.map((p) => clean(p ?? "")).filter(Boolean);
    if (ps.length) texts[id] = { label, paragraphs: ps };
  };
  put("nombre", "nombre del artista o de la empresa", [view.name]);
  put("lema", "frase corta que resume su trabajo", [view.tagline]);
  put("ciudad", "ciudad", [view.city]);
  put("fecha", "fecha del dossier", [view.date]);

  let works: WorkView[];
  let prose: string[];
  if (view.kind === "creator") {
    put("disciplina", "disciplinas", [view.discipline]);
    put("declaracion", "declaración artística", view.statement);
    put("biografia", "biografía", view.bio);
    put(
      "trayectoria",
      "currículum: exposiciones, formación, premios",
      view.cv.flatMap((g) => {
        const seen = new Set<string>();
        const lines = g.items
          .map((i) => ({ year: i.year, text: i.text.replace(/^[\s·•\-–—]+/, ""), place: i.place }))
          .map((i) => `${i.year ? `${i.year} · ` : ""}${i.text}${i.place ? `, ${i.place}` : ""}`)
          .filter((l) => !seen.has(l.toLowerCase()) && !!seen.add(l.toLowerCase()));
        return [g.title.toUpperCase(), ...lines];
      }),
    );
    works = view.series.flatMap((s) => s.works);
    prose = [...view.statement, ...view.bio];
    put("t.obra", "título de sección de las obras", [vocabFor(view.family).works]);
    for (const k of ["statement", "bio", "cv", "contact"] as const) {
      const key = { statement: "declaracion", bio: "biografia", cv: "trayectoria", contact: "contacto" }[k];
      const def = DEFAULT_TITLES[{ statement: "statement", bio: "bio", cv: "cv", contact: "contact" }[k] as keyof typeof DEFAULT_TITLES];
      put(`t.${key}`, `título de sección «${def}»`, [def]);
    }
  } else {
    put("disciplina", "actividad en una línea", [view.activityShort]);
    put("actividad", "a qué se dedica la empresa", view.activity);
    put("equipo", "el equipo", view.team.text);
    put("proyectos", "proyectos", view.projects.text);
    works = view.projects.works;
    prose = [...view.activity, ...view.team.text, ...view.projects.text];
    put("t.obra", "título de sección de proyectos", [DEFAULT_TITLES.projects]);
    put("t.actividad", "título de sección de actividad", [DEFAULT_TITLES.activity]);
    put("t.contacto", "título de sección de contacto", [DEFAULT_TITLES.contact]);
  }
  put(
    "contacto",
    "datos de contacto",
    view.contact.map((r) => `${r.label}: ${r.value}`),
  );

  sentencesOf(prose)
    .slice(0, MAX_QUOTES)
    .forEach((s, i) => put(`frase.${i + 1}`, "frase suya, buena como cita", [s]));
  (opts.said ?? [])
    .map(clean)
    .filter((s) => s.length >= 30 && s.length <= 400)
    .slice(0, MAX_SAID)
    .forEach((s, i) => put(`dicho.${i + 1}`, "algo que contó en la entrevista, con sus palabras", [s]));

  const confirmed = works.filter((w) => w.confirmed && w.imageUrl);
  const catalogWorks: CatalogWork[] = confirmed.map((w, i) => {
    const n = i + 1;
    put(`obra.${n}.titulo`, `título de la obra ${n}`, [w.title]);
    put(`obra.${n}.ficha`, `ficha de la obra ${n}`, [[w.title, w.year, w.technique, w.size].filter(Boolean).join(" · ")]);
    put(`obra.${n}.concepto`, `texto sobre la obra ${n}`, [w.concept]);
    return { n, id: w.id, title: w.title, imageUrl: w.imageUrl, crop: w.crop, ratio: opts.ratios?.[w.id], colors: opts.colors?.[w.id] };
  });
  // A section title without its section would leave a heading over an empty page.
  for (const id of Object.keys(texts)) if (id.startsWith("t.") && (id === "t.obra" ? !catalogWorks.length : !texts[id.slice(2)])) delete texts[id];
  return { name: view.name, texts, works: catalogWorks };
}

/** Lowercase, straight quotes, single spaces: how a quote is compared with what the artist said. */
export function normalizeForQuote(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[«»“”„"]/g, "")
    .replace(/[‘’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `quote` is a verbatim excerpt of a text of the artist (any catalog text, one paragraph at a time). */
export function isVerbatim(quote: string, catalog: Catalog): boolean {
  const q = normalizeForQuote(quote).replace(/…$/, "").replace(/\.\.\.$/, "").trim();
  if (q.length < 3) return false;
  return Object.entries(catalog.texts).some(([id, t]) => !id.startsWith("t.") && t.paragraphs.some((p) => normalizeForQuote(p).includes(q)));
}

/** What the agent sees of the catalog: ids, what they are and a preview (never more than needed). */
export function catalogForAgent(catalog: Catalog) {
  return {
    textos: Object.entries(catalog.texts).map(([id, t]) => ({
      id,
      es: t.label,
      caracteres: t.paragraphs.join(" ").length,
      vista: t.paragraphs.join(" ").slice(0, id.startsWith("frase.") || id.startsWith("dicho.") ? 240 : 140),
    })),
    tipografias: Object.fromEntries(Object.entries(FONT_TABLE).map(([name, f]) => [name, `${f.category}; pesos ${f.weights.join("/")}${f.italic ? "; con cursiva" : ""}`])),
    numeroDeObras: catalog.works.length,
    obras: catalog.works.map((w) => ({
      n: w.n,
      titulo: w.title,
      ...(w.colors?.length ? { coloresDominantes: w.colors } : {}),
      ...(w.ratio ? { proporcion: Number(w.ratio.toFixed(2)), orientacion: w.ratio > 1.1 ? "apaisada" : w.ratio < 0.9 ? "vertical" : "cuadrada" } : {}),
    })),
  };
}
