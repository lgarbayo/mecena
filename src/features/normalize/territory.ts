/**
 * Territory: NUTS codes (as BDNS uses them), INE codes, Spanish/Galician/Basque/Catalan names and the
 * 313 Galician municipalities, all resolved to one tree with containment:
 * mun:15030 (A Coruña city) ⊂ ES111 (A Coruña province) ⊂ ES11 (Galicia) ⊂ ES1 ⊂ ES (España) ⊂ WORLD.
 */
import { taxonomy, type TerritoryLevel, type TerritoryNode } from "./taxonomy";
import { fold, PhraseMatcher, unique } from "./text";

const nodes = taxonomy.territories.items;
const byId = new Map(nodes.map((n) => [n.id, n]));
const provinceByIne = new Map(nodes.filter((n) => n.level === "province" && n.ine).map((n) => [n.ine!, n.id]));
const ccaaByIne = new Map(nodes.filter((n) => n.level === "ccaa" && n.ine).map((n) => [n.ine!, n.id]));
const municipalityByIne = new Map(nodes.filter((n) => n.level === "municipality").map((n) => [n.ine!, n.id]));
const LEVEL_RANK: Record<TerritoryLevel, number> = { world: 0, country: 1, nuts1: 2, ccaa: 3, province: 4, municipality: 5 };

/** Words that only mean "state-wide" when they are the whole value, never inside a longer sentence. */
const EXACT_ONLY: Record<string, string[]> = { ES: ["nacional", "estatal"] };

// Short single-word municipality names that collide with common words in calls ("Cee", "Mos", "Teo", "Ares").
const isRiskyForScan = (n: TerritoryNode, name: string) => n.level === "municipality" && !fold(name).includes(" ") && fold(name).length <= 4;

const matcher = new PhraseMatcher(
  nodes.map((n) => {
    const all = unique([n.name, ...n.names]);
    return {
      id: n.id,
      phrases: all.filter((p) => !isRiskyForScan(n, p) && !(EXACT_ONLY[n.id] ?? []).includes(fold(p))),
      exactOnly: all.filter((p) => isRiskyForScan(n, p) || (EXACT_ONLY[n.id] ?? []).includes(fold(p))),
    };
  }),
);

export type TerritoryPreference = "broadest" | "narrowest";

export interface TerritoryResult {
  id: string | null; // chosen territory id
  candidates: string[]; // every id the input could mean (e.g. "Lugo" = province and city)
  via: "code" | "ine" | "name" | "scan" | "fuzzy" | null;
}

const PREFIX_HINTS: { re: RegExp; level: TerritoryLevel }[] = [
  // Articles are kept ("concello de A Estrada" → "a estrada") because they are part of official names.
  { re: /^(?:concello|ayuntamiento|municipio|concejo|localidad|cidade|ciudad|vila|villa) d(?:e|o|a)\s+/, level: "municipality" },
  { re: /^(?:provincia|deputacion|diputacion(?: provincial)?) d(?:e|o|a)\s+/, level: "province" },
  { re: /^(?:comunidad autonoma|comunidade autonoma|comunidad|comunitat|region|ccaa) d(?:e|o|a)\s+/, level: "ccaa" },
];

/** "Coruña (A)", "Coruña, A", "Estrada (A)" → "A Coruña" / "A Estrada". */
function flipArticle(text: string): string {
  const m = text.match(/^(.*?)\s*(?:,\s*|\(\s*)(a|o|as|os|la|el|las|los)\s*\)?\s*$/i);
  return m ? `${m[2]} ${m[1]}` : text;
}

function pick(ids: string[], prefer: TerritoryPreference, levelHint?: TerritoryLevel): string | null {
  if (!ids.length) return null;
  if (levelHint) {
    const hinted = ids.filter((id) => byId.get(id)!.level === levelHint);
    if (hinted.length) ids = hinted;
  }
  const sorted = [...ids].sort((a, b) => LEVEL_RANK[byId.get(a)!.level] - LEVEL_RANK[byId.get(b)!.level]);
  return prefer === "broadest" ? sorted[0] : sorted[sorted.length - 1];
}

/**
 * Resolve one territory value to a canonical id.
 * Accepts NUTS codes ("ES11", "ES11 - GALICIA", "ES - ESPAÑA "), BDNS world entries ("XXXX - TODO EL MUNDO"),
 * INE codes ("15" province, "15030" municipality), and names in es/gl/eu/ca with or without accents and
 * articles ("A Coruña", "La Coruña", "Coruña (A)", "Orense", "Sanxenxo", "Comunidad Autónoma de Galicia").
 * `prefer` breaks ties when a name is both a province and a city ("Lugo"): "broadest" for call scopes
 * (default), "narrowest" for a profile's city field.
 */
export function normalizeTerritory(input: string | number | null | undefined, opts: { prefer?: TerritoryPreference; ine?: "province" | "ccaa" } = {}): TerritoryResult {
  const prefer = opts.prefer ?? "broadest";
  const none: TerritoryResult = { id: null, candidates: [], via: null };
  if (input === null || input === undefined) return none;
  const raw = String(input).trim();
  if (!raw) return none;

  // NUTS / BDNS codes
  const code = raw.match(/^(ES[0-9A-Z]{0,3}|X{3,4})(?:\s*-\s*.*)?$/i);
  if (code) {
    const c = code[1].toUpperCase();
    if (c.startsWith("XXX")) return { id: "WORLD", candidates: ["WORLD"], via: "code" };
    if (byId.has(c)) return { id: c, candidates: [c], via: "code" };
  }
  // INE codes
  if (/^\d{1,2}$/.test(raw)) {
    const ine = raw.padStart(2, "0");
    const id = opts.ine === "ccaa" ? ccaaByIne.get(ine) : provinceByIne.get(ine);
    if (id) return { id, candidates: [id], via: "ine" };
  }
  if (/^\d{5}$/.test(raw)) {
    const id = municipalityByIne.get(raw) ?? provinceByIne.get(raw.slice(0, 2));
    if (id) return { id, candidates: [id], via: "ine" };
  }

  // Names
  let text = fold(raw);
  let levelHint: TerritoryLevel | undefined;
  for (const h of PREFIX_HINTS) {
    if (h.re.test(text)) {
      text = text.replace(h.re, "");
      levelHint = h.level;
      break;
    }
  }
  const flipped = flipArticle(raw);
  for (const t of unique([text, fold(flipped)])) {
    const hits = matcher.exact(t);
    if (hits.length) {
      const ids = unique(hits.map((h) => h.id));
      return { id: pick(ids, prefer, levelHint), candidates: ids, via: "name" };
    }
  }
  const scanned = unique(matcher.scan(raw).map((h) => h.id));
  if (scanned.length) {
    // In a sentence, keep the most specific places mentioned; several distinct places stay as candidates.
    return { id: pick(scanned, prefer, levelHint), candidates: scanned, via: "scan" };
  }
  const fuzzy = unique(matcher.fuzzy(text).map((h) => h.id));
  if (fuzzy.length) return { id: pick(fuzzy, prefer, levelHint), candidates: fuzzy, via: "fuzzy" };
  return none;
}

/**
 * A profile that lives outside Spain is stored with this territory: inside no Spanish unit, so calls that require
 * living in a comunidad, province or town fail, and calls open to anyone (WORLD) still pass.
 */
export const ABROAD = "WORLD";

// Countries and big foreign cities (es/en), folded. Only names that are no Spanish place: "Santiago", "Córdoba",
// "Valencia", "Mérida", "Guadalajara", "León"… are left out (Spanish names are resolved first anyway).
const FOREIGN_PLACES = (
  "extranjero|fuera de espana|abroad|china|pekin|beijing|shanghai|hong kong|japon|japan|tokio|tokyo|corea|korea|seul|seoul|" +
  "india|nueva delhi|bombay|mumbai|tailandia|bangkok|vietnam|singapur|singapore|indonesia|filipinas|australia|sidney|sydney|melbourne|" +
  "nueva zelanda|estados unidos|eeuu|ee uu|usa|united states|nueva york|new york|los angeles|san francisco|chicago|miami|boston|canada|toronto|montreal|vancouver|" +
  "mexico|ciudad de mexico|cdmx|argentina|buenos aires|chile|colombia|bogota|medellin|peru|venezuela|caracas|ecuador|quito|uruguay|montevideo|" +
  "paraguay|bolivia|cuba|la habana|brasil|brazil|sao paulo|rio de janeiro|francia|france|paris|marsella|lyon|alemania|germany|berlin|munich|hamburgo|" +
  "italia|italy|roma|milan|napoles|florencia|portugal|lisboa|oporto|porto|reino unido|united kingdom|inglaterra|england|escocia|londres|london|" +
  "manchester|edimburgo|irlanda|ireland|dublin|paises bajos|holanda|netherlands|amsterdam|rotterdam|belgica|belgium|bruselas|brussels|suiza|zurich|ginebra|" +
  "austria|viena|vienna|suecia|estocolmo|noruega|oslo|dinamarca|copenhague|finlandia|helsinki|polonia|varsovia|chequia|praga|hungria|budapest|grecia|atenas|" +
  "rumania|bucarest|bulgaria|ucrania|kiev|rusia|moscu|turquia|estambul|istanbul|israel|tel aviv|egipto|el cairo|marruecos|morocco|rabat|casablanca|tanger|" +
  "argelia|tunez|senegal|dakar|nigeria|lagos|kenia|nairobi|sudafrica|ciudad del cabo|emiratos|dubai|abu dabi|qatar|doha|arabia saudi"
).split("|");
const FOREIGN_RE = new RegExp(`(?:^|[^a-z0-9])(?:${FOREIGN_PLACES.join("|")})(?:$|[^a-z0-9])`);

/** "Beijing", "Pekín (China)", "Berlín", "vivo en el extranjero" → true. Only for text that resolved to no Spanish place. */
export function isAbroad(text: string | null | undefined): boolean {
  return Boolean(text?.trim()) && FOREIGN_RE.test(fold(text!));
}

/** All territories mentioned in a free-text eligibility sentence ("residentes en Galicia o en Asturias"). */
export function extractTerritories(text: string): string[] {
  // "Asturias" names both ES12 and ES120: keep one id per equivalent unit (the broadest).
  const ids = unique(matcher.scan(text).map((h) => h.id)).sort((a, b) => LEVEL_RANK[byId.get(a)!.level] - LEVEL_RANK[byId.get(b)!.level]);
  const seen = new Set<string>();
  return ids.filter((id) => {
    const c = canonicalTerritory(id);
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

export function territoryNode(id: string): TerritoryNode | undefined {
  return byId.get(id);
}

export function territoryName(id: string): string {
  return byId.get(id)?.name ?? id;
}

/** [id, parent, …, "WORLD"] */
export function territoryAncestors(id: string): string[] {
  const out: string[] = [];
  for (let cur = byId.get(id); cur; cur = cur.parent ? byId.get(cur.parent) : undefined) out.push(cur.id);
  return out;
}

/**
 * Collapse single-child chains so equivalent units compare equal:
 * ES3 → ES30 → ES300 (Comunidad de Madrid = provincia de Madrid), ES12 → ES120 (Asturias).
 */
export function canonicalTerritory(id: string): string {
  let cur = id;
  for (;;) {
    const kids = nodes.filter((n) => n.parent === cur && n.level !== "municipality");
    if (kids.length !== 1) return cur;
    cur = kids[0].id;
  }
}

/** The comunidad autónoma (NUTS2) containing a territory, if any. */
export function ccaaOf(id: string): string | undefined {
  return territoryAncestors(id).find((a) => byId.get(a)?.level === "ccaa");
}

/**
 * Is the profile's territory inside the call's territory?
 * isWithin("mun:15030", "ES11") → true (A Coruña ⊂ Galicia); isWithin("ES111", "ES") → true;
 * isWithin("ES111", "ES300") → false; anything is within "WORLD".
 * Returns false when either side is unknown: callers decide whether unknown means "confirm".
 */
export function isWithin(profileTerritory: string | null | undefined, callTerritory: string | null | undefined): boolean {
  if (!profileTerritory || !callTerritory) return false;
  const call = canonicalTerritory(callTerritory);
  if (call === "WORLD") return true;
  return territoryAncestors(profileTerritory).some((a) => canonicalTerritory(a) === call);
}

/** Territory check against a call's list (applicant must be within ANY). Empty list = state-wide (ES). */
export function territoryCheck(profileTerritory: string | null | undefined, callTerritories: readonly string[]): "pass" | "fail" | "unknown" {
  const scope = callTerritories.length ? callTerritories : ["ES"];
  if (scope.includes("WORLD")) return "pass";
  if (!profileTerritory) return "unknown";
  return scope.some((t) => isWithin(profileTerritory, t)) ? "pass" : "fail";
}
