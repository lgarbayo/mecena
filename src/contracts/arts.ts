/**
 * CCR-arts: which family of the arts a profile belongs to, so screens, prompts and the dossier adapt
 * to music, performing arts, audiovisual, literature… and not only to painting.
 * Pure and dependency-free (the taxonomy JSON is bundled statically), so client components can import it.
 */
import { z } from "zod";
import disciplines from "../../data/taxonomy/disciplines.json";
import type { MediaKind } from "./domain";

/** Top-level ids of data/taxonomy/disciplines.json. */
export const ArtFamily = z.enum(["artes-visuales", "musica", "artes-escenicas", "audiovisual", "literatura", "diseno", "artesania", "gestion-cultural"]);
export type ArtFamily = z.infer<typeof ArtFamily>;

const DEFAULT_FAMILY: ArtFamily = "artes-visuales";

/** Lowercase, no accents, single spaces, letters/digits only. */
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/** Everyday words people use for themselves that the taxonomy does not list (instruments, roles…). */
const EXTRA_TERMS: Record<ArtFamily, string[]> = {
  "artes-visuales": ["artista", "arte", "videoartista"],
  musica: [
    "pianista", "piano", "guitarrista", "guitarra", "violinista", "violin", "violonchelista", "chelista", "violonchelo", "contrabajista",
    "bajista", "bateria", "baterista", "percusionista", "percusion", "saxofonista", "trompetista", "clarinetista", "flautista", "arpista",
    "organista", "acordeonista", "cantautor", "cantautora", "cantaora", "cantaor", "soprano", "tenor", "baritono", "mezzosoprano",
    "director de orquesta", "directora de orquesta", "banda", "grupo", "cuarteto", "musica clasica", "flamenco", "productora musical",
    "beatmaker", "letrista", "lirica", "opera", "zarzuela", "sinfonica",
  ],
  "artes-escenicas": ["actuacion", "interprete", "artista escenico", "artista escenica", "acrobata", "malabarista", "trapecista", "payaso", "payasa", "mimo", "titiritero", "titiritera", "ballet", "bailaor", "bailaora", "funcion", "escena"],
  audiovisual: ["realizador", "realizadora", "directora", "director de fotografia", "montador", "montadora", "videoclip", "cortos", "serie de television", "television", "podcast"],
  literatura: ["poesia", "poemas", "narradora", "narrador", "cuentista", "autora", "autor", "libros"],
  diseno: ["disenadora grafica", "disenador grafico", "ux", "ui", "diseno web"],
  artesania: ["artesana", "artesano", "tejedora", "tejedor", "orfebre", "luthier", "vidriera"],
  "gestion-cultural": ["programadora", "programador cultural", "mediadora", "mediador", "productora cultural", "productor cultural"],
};

type Term = { phrase: string; family: ArtFamily };

const TERMS: Term[] = (() => {
  const items = disciplines.items as { id: string; parent: string | null; label: { es: string; gl: string }; synonyms?: string[] }[];
  const familyOf = (id: string): ArtFamily | undefined => {
    let cur = items.find((i) => i.id === id);
    while (cur?.parent) cur = items.find((i) => i.id === cur!.parent);
    const parsed = ArtFamily.safeParse(cur?.id);
    return parsed.success ? parsed.data : undefined;
  };
  const out: Term[] = [];
  for (const item of items) {
    const family = familyOf(item.id);
    if (!family) continue;
    for (const p of [item.id.replace(/-/g, " "), item.label.es, item.label.gl, ...(item.synonyms ?? [])]) out.push({ phrase: foldText(p), family });
  }
  for (const [family, words] of Object.entries(EXTRA_TERMS) as [ArtFamily, string[]][]) for (const w of words) out.push({ phrase: foldText(w), family });
  // Longest phrase first: "libro ilustrado" (visual arts) must beat "libro" (literature).
  return out.filter((t) => t.phrase).sort((a, b) => b.phrase.length - a.phrase.length);
})();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TERM_RES = TERMS.map((t) => ({ ...t, re: new RegExp(`(?:^| )${escapeRe(t.phrase)}(?:e?s)?(?: |$)`) }));

/** Family of one discipline (free text or taxonomy id), or undefined when nothing matches. */
export function disciplineFamily(discipline: string): ArtFamily | undefined {
  const text = foldText(discipline);
  if (!text) return undefined;
  const exact = TERMS.find((t) => t.phrase === text);
  if (exact) return exact.family;
  return TERM_RES.find((t) => t.re.test(text))?.family;
}

/**
 * Family of a profile from its disciplines: the most frequent family; ties go to the first one the
 * artist named. No recognisable discipline -> "artes-visuales".
 */
export function artFamily(disciplines: readonly string[] | undefined): ArtFamily {
  const votes = new Map<ArtFamily, number>();
  for (const d of disciplines ?? []) {
    const f = disciplineFamily(d);
    if (f) votes.set(f, (votes.get(f) ?? 0) + 1);
  }
  let best: ArtFamily = DEFAULT_FAMILY;
  let bestVotes = 0;
  for (const [f, n] of votes) if (n > bestVotes) [best, bestVotes] = [f, n];
  return best;
}

/** What a typical work of the family is, when nothing more specific is known. */
export function defaultMediaKind(family: ArtFamily): MediaKind {
  switch (family) {
    case "musica":
      return "audio";
    case "artes-escenicas":
      return "performance";
    case "audiovisual":
      return "video";
    case "literatura":
      return "text";
    case "artesania":
      return "object";
    default:
      return "image";
  }
}

/** Media kind a link points to (youtube/vimeo -> video, bandcamp/soundcloud/spotify -> audio), if obvious. */
export function mediaKindFromLink(url: string): MediaKind | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
  const is = (d: string) => host === d || host.endsWith(`.${d}`);
  if (["youtube.com", "youtu.be", "vimeo.com", "dailymotion.com", "filmin.es", "tiktok.com"].some(is)) return "video";
  if (["bandcamp.com", "soundcloud.com", "spotify.com", "music.apple.com", "mixcloud.com", "ivoox.com", "deezer.com", "tidal.com"].some(is)) return "audio";
  return undefined;
}
