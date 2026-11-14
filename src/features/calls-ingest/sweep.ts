/**
 * National BDNS sweep for creators: find the calls an artist can actually apply to across ALL of Spain.
 *
 * BDNS holds ~3.800 culture records in three months, but most are agreements (convenios), nominative or direct grants
 * to a named association, fiestas and school contests. Reading each one costs a BDNS request, and structuring it costs
 * a Claude call on the owner's key, so the cheap, deterministic filters run first, in this order:
 *   1. title (this file, no network): only titles that look like a call for an individual artist survive;
 *   2. detail (ingest.ts): competitive concurrence, open, not expired;
 *   3. beneficiaries (here): a call only for companies/entities is not for a creator;
 *   4. only then Claude structures it (live.ts, with its per-run and daily caps).
 */
import type { BdnsDetail, BdnsQuery } from "./ingest";
import { bdnsToCallPatch } from "@/features/normalize";
import { fold } from "@/features/normalize/text";

/** `matched` is the fragment of the title that decided it (for the sweep report and for tuning the lists). */
export type TitleVerdict =
  /** `artist`: the title names an artistic practice. `generic`: only prize/certamen/beca words, so it needs a cultural BDNS purpose. */
  | { keep: true; strength: "artist" | "generic"; why: string; matched: string }
  | { keep: false; reason: string; matched: string };

// ---------- 1. title filter ----------

/** The call is an agreement or a grant already given to someone: never open to apply. */
const NOT_A_CALL = new RegExp(
  [
    "convenio", "\\bconv (?:colabora|con)", "colabora con", "concesion directa", "nominativ", "nominad", "\\bsubv\\.? nom", "\\bsn a\\b", // Diputación de Cáceres: "SN a la Asociación …"
    "^concesion\\b", "concesion (?:de la |de )?subvencion a\\b", // already granted: "CONCESIÓN DE PREMIOS DEL CONCURSO …", "concesión subvención a la UPV"
    "subvencion(?:es)? directa", "aj(?:ut|uda)s? directe?s?", "excluida de concurrencia", "encomienda", "firma de convenio",
    "colaboracion (?:economica|con la|con el)", "aprobacion de la subvencion",
    "(?:resolucion|decreto|acuerdo)[^,]{0,60}(?:concede|conceden|adjudica)",
    // a named beneficiary: "subvención cultural a la asociación X", "a favor de la Diócesis …", "al grupo de danzas X", "a agrupación X"
    "\\b(?:a favor de|a|al)\\s+(?:la |el |los |las )?(?:asociacion|asoc\\b|federacion|fundacion|cofradia|hermandad|club|comparsa|coral|banda|agrupacion|grupo|entidad|universidad|upv|diocesis|obispado|parroquia|orfeon|escuela|conservatorio|ayuntamiento|consell|cabildo|mancomunidad|peña|pena|colla)",
    "^(?:subvencion|ayuda)(?: cultural)? (?:a|para) (?:la|el) (?:asociacion|comparsa|coral|banda)",
  ].join("|"),
);

/** Calls for entities, venues, kids or heritage works, not for an artist's work: they block even when an art word is present. */
const NOT_FOR_ARTISTS = new RegExp(
  [
    "asociaciones", "entidades", "federaciones", "clubes", "cofradias", "hermandades", "comparsas", "\\bampas?\\b", "ayuntamientos", "municipios", "bandas",
    "escuelas de", "bibliotecas", "fondos bibliograficos", "salas (?:privadas|de)", "galerias", "librerias", "editoriales", "festivales de", "programacion de",
    "rehabilit", "restaur", "inmueble", "bienes de interes cultural", "patrimonio (?:historico|inmaterial|arquitectonico)", "diversidad funcional", "personas con ",
    "infantil", "escolar", "alumn", "colegio", "centros educativos", "instituto de (?:educacion|secundaria|bachillerato)", "ludoteca", "voluntari", "bolsa de empleo",
    "proceso selectivo", "oposicion", "licitacion", "contratacion", "deport", "ajedrez", "pesca", "taurin", "padel", "maraton", "carrera",
    // academic and professional prizes: theses, final projects, teaching, journalism, research grants, language courses
    "universidad", "universitat", "universitari", "catedra", "\\baula\\b", "fin de (?:grado|master|estudios)", "\\btf[gm]\\b", "tesis", "doctorado", "excelencia academica", "docente", "docencia", "periodismo",
    "investigacion", "cursos? de", "bachillerato", "formacion profesional", "ensenanzas profesionales", "escuela municipal", "copa\\b", "proteccion y conservacion", "euskera", "euskara", "estadistica", "emprend", "antibiotic", "salud", "transparencia",
  ].join("|"),
);

/** Festive or local themes that block only the generic call words: a poster contest for the fiestas is still a poster. */
const FESTIVE_OR_FOOD = new RegExp(
  [
    "belen", "nacimientos", "navid", "reyes magos", "escaparat", "disfraz", "carroza", "fachadas", "balcones", "patios", "cruces de mayo",
    "moros y cristianos", "semana santa", "romeria", "fallas", "hogueras", "fiestas", "carnaval", "carnestoltes", "desfile", "agrupaciones", "chirigot", "murga", "penas",
    "gastronom", "tapas", "cocina", "repostreria", "paella", "mercadillo", "mosto", "\\bvino", "queso", "aceite", "ollas", "caza\\b", "calabaza", "castan", "agricol", "consumo", "bolos", "olimp", "dioramas", "lego",
  ].join("|"),
);

/** Words that name an artist's practice or a creator: enough on their own (a poster contest for the fiestas is still a poster). */
const ARTIST_TERMS = new RegExp(
  [
    "pintura", "pintor", "escultura", "escultor", "ilustracion", "ilustrador", "fotograf", "dibujo", "grabado", "comic", "historieta", "cartel", "cartell",
    "artes? (?:plastica|visual|escenica|grafica|audiovisual|y oficios)", "arte contemporaneo", "arte urbano", "videoarte",
    "musica", "musical", "compositor", "composicion", "cancion", "discograf", "orquesta", "piano",
    "teatro", "teatral", "danza", "circo", "performance", "titeres", "monologo",
    "cine\\b", "cinemato", "cortometraje", "audiovisual", "documental", "animacion", "videojuego",
    "literari", "literatura", "poesia", "poemario", "novela", "relato", "microrrelato", "narrativ", "cuento", "ensayo", "guion", "dramaturg",
    "artesan", "ceramica", "joyeria", "textil", "moda\\b", "diseno",
    "artista", "creador", "creadora", "creacion (?:artistica|literaria|cultural|contemporanea|digital)", "residencia (?:artistica|de|para)",
    "produccion (?:artistica|cultural|audiovisual|teatral|escenica|musical|discografica|editorial)", "edicion (?:literaria|musical)", "obra (?:plastica|artistica|original)",
  ].join("|"),
);

/** Generic call words: they only count when nothing says the call is for somebody else. */
const CALL_TERMS = /premio|certamen|concurso|\bbeca|\bbolsa|convocatoria de (?:ayudas|subvenciones)|ayudas? (?:a|para) la (?:creacion|produccion|edicion|publicacion|difusion|promocion)/;

const word = (re: RegExp) => new RegExp(`\\b(?:${re.source})`);
const NOT_FOR_ARTISTS_W = word(NOT_FOR_ARTISTS);
const ARTIST_TERMS_W = word(ARTIST_TERMS);
const FESTIVE_OR_FOOD_W = word(FESTIVE_OR_FOOD);

/** Deterministic, no network: is this BDNS title plausibly an open call for an individual creator? */
export function titleVerdict(title: string): TitleVerdict {
  const t = fold(title);
  if (!t) return { keep: false, reason: "sin título", matched: "" };
  const drop = (re: RegExp, reason: string): TitleVerdict | undefined => {
    const m = t.match(re);
    return m ? { keep: false, reason, matched: m[0] } : undefined;
  };
  const blocked = drop(NOT_A_CALL, "convenio, subvención nominativa o ya concedida") ?? drop(NOT_FOR_ARTISTS_W, "para entidades, escuelas, menores o patrimonio");
  if (blocked) return blocked;
  const art = t.match(ARTIST_TERMS_W);
  if (art) return { keep: true, strength: "artist", why: "nombra una práctica artística", matched: art[0] };
  const festive = drop(FESTIVE_OR_FOOD_W, "fiestas, gastronomía o concursos locales");
  if (festive) return festive;
  const call = t.match(CALL_TERMS);
  if (call) return { keep: true, strength: "generic", why: "premio, certamen o beca sin otro destinatario", matched: call[0] };
  return { keep: false, reason: "sin señal de convocatoria para artistas", matched: "" };
}

// ---------- 3. beneficiaries ----------

/** Beneficiary types a creator can be: a person, a freelancer, or a collective of people. */
const CREATOR_FORMS: readonly string[] = ["persona-fisica", "autonomo", "colectivo"];

/**
 * Free check on the full BDNS record, before Claude: a call that lists beneficiaries and none is a person, a freelancer
 * or a collective is for companies, non-profits or administrations, not for an individual creator. No beneficiary data
 * (BDNS "sin información específica") = unknown = keep: the matching engine asks to confirm it later.
 */
export function openToCreators(d: BdnsDetail): { ok: true } | { ok: false; reason: string } {
  const forms: readonly string[] = bdnsToCallPatch(d).eligibility.legalForms;
  if (forms.length === 0 || forms.some((f) => CREATOR_FORMS.includes(f))) return { ok: true };
  return { ok: false, reason: `solo para ${forms.join(", ")}` };
}

// ---------- 2. sweep queries ----------

/** One page of a BDNS search, with the titles: they are what the cheap filter reads. */
export interface SweepHit {
  code: string;
  title: string;
  organ: string;
  /** Found by the culture search (BDNS purpose 11): a generic "premio" title is only trusted then. */
  cultural?: boolean;
}

export interface SweepPageClient {
  searchPage(q: BdnsQuery, since: string, page: number, pageSize: number): Promise<{ hits: SweepHit[]; last: boolean }>;
}

/**
 * Searches of the national sweep, each with a page budget. Culture (finalidad 11) nationwide is the base; the terms
 * reach calls BDNS files under other purposes (a poster contest is "fiestas", a short-film prize is "audiovisual").
 */
/** BDNS `finalidad` id for culture (data/calls/SOURCES.md). */
const CULTURA = "11";

export const SWEEP_QUERIES: { query: BdnsQuery; maxPages: number }[] = [
  { query: { finalidad: CULTURA }, maxPages: 25 },
  ...["certamen", "concurso", "premio", "beca", "residencia artística", "cartel", "ilustración", "pintura", "fotografía", "música", "teatro", "danza", "literario", "cortometraje", "audiovisual", "artesanía", "creación artística"].map((descripcion) => ({
    query: { descripcion },
    maxPages: 3,
  })),
];

export interface SweepStats {
  searches: number;
  seen: number; // distinct BDNS codes found
  kept: number;
  dropped: Record<string, number>; // reason → count
}

/** Run the searches, dedupe by BDNS code and keep the titles that pass the cheap filter. */
export async function sweepCandidates(
  client: SweepPageClient,
  opts: { since: string; queries?: typeof SWEEP_QUERIES; pageSize?: number; log?: (m: string) => void },
): Promise<{ candidates: SweepHit[]; stats: SweepStats }> {
  const log = opts.log ?? (() => {});
  const pageSize = opts.pageSize ?? 200;
  const seen = new Map<string, SweepHit>();
  let searches = 0;
  for (const { query, maxPages } of opts.queries ?? SWEEP_QUERIES) {
    let before = seen.size;
    for (let page = 0; page < maxPages; page++) {
      let res;
      try {
        res = await client.searchPage(query, opts.since, page, pageSize);
      } catch (e) {
        log(`search ${JSON.stringify(query)} page ${page} failed: ${e instanceof Error ? e.message : e}`);
        break; // one failing search does not sink the sweep
      }
      searches++;
      for (const h of res.hits) {
        const prev = seen.get(h.code);
        if (!prev) seen.set(h.code, { ...h, cultural: query.finalidad === CULTURA });
        else if (query.finalidad === CULTURA) prev.cultural = true;
      }
      if (res.last || res.hits.length < pageSize) break;
    }
    log(`search ${JSON.stringify(query)}: +${seen.size - before} new codes (${seen.size} total)`);
  }
  const dropped: Record<string, number> = {};
  const candidates: SweepHit[] = [];
  for (const h of seen.values()) {
    const v = titleVerdict(h.title);
    if (v.keep && v.strength === "generic" && !h.cultural) dropped["premio genérico fuera de cultura"] = (dropped["premio genérico fuera de cultura"] ?? 0) + 1;
    else if (v.keep) candidates.push(h);
    else dropped[v.reason] = (dropped[v.reason] ?? 0) + 1;
  }
  return { candidates, stats: { searches, seen: seen.size, kept: candidates.length, dropped } };
}
