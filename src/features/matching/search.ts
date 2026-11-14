/**
 * Free-text search over calls (feed filter, search_calls `query`). Accent- and case-insensitive, token by token
 * (every meaningful word must match somewhere), over title, summary, organiser, type, territory and disciplines,
 * with light stemming (plural/gender) and Galician ↔ Spanish synonyms (deputación ↔ diputación, concello ↔
 * ayuntamiento, bolsa ↔ beca…). Pure and deterministic.
 */
import type { Call } from "@/contracts";
import { disciplineAncestors, disciplineLabel, fold, isDisciplineId, normalizeDiscipline, normalizeTerritory, territoryAncestors, territoryName } from "@/features/normalize";

/** Groups of interchangeable words (folded). A query word matches any word of its group. */
const SYNONYMS: string[][] = [
  ["diputacion", "deputacion", "diputacio", "provincial"],
  ["ayuntamiento", "concello", "concejo", "ajuntament", "municipal", "municipio", "concellos"],
  ["junta", "xunta", "autonomico", "autonomica"],
  ["beca", "bolsa", "beques", "ayudas a la creacion"],
  ["ayuda", "axuda", "subvencion", "subvencions", "subvenciones", "axudas"],
  ["premio", "galardon", "premi"],
  ["certamen", "certame", "concurso", "concurso de"],
  ["residencia", "residencias", "residency"],
  ["coruna", "corunha", "corunes"],
  ["ourense", "orense"],
  ["galicia", "galiza", "gallego", "gallega", "galego", "galega"],
  ["pintura", "pintor", "pintora", "pictorico", "pictorica"],
  ["ilustracion", "ilustrador", "ilustradora", "ilustracions"],
  ["fotografia", "fotografo", "fotografa", "foto"],
  ["escultura", "escultor", "escultora"],
  ["comic", "historieta", "banda deseñada", "bd"],
  ["autonomo", "autonoma", "emprendedor", "emprendedora", "emprendemento", "emprendimiento"],
  ["pyme", "empresa", "empresas", "negocio", "comercio"],
  ["digitalizacion", "digital", "dixital", "dixitalizacion"],
  ["artesania", "artesano", "artesana", "artesan"],
  ["ceramica", "ceramista", "alfareria"],
  ["joven", "jovenes", "xoven", "xoves", "juventud", "xuventude"],
];

const STOP = new Set("a al as con da das de del do dos e el en la las los mi mis o os para por que se sin su sus un una y".split(" "));

/** Light stem: drops a plural and then a gender vowel, so beca/becas, pintor/pintora, artes/arte meet. */
export function stem(w: string): string {
  let s = w;
  if (s.length > 4) s = s.replace(/(?:es|s)$/, "");
  if (s.length > 4) s = s.replace(/[ao]$/, "");
  return s;
}

const words = (text: string) => fold(text).split(/[^a-z0-9ñ]+/).filter(Boolean);

const GROUP_OF = new Map<string, string[]>();
for (const g of SYNONYMS) for (const w of g) for (const x of [w, stem(w)]) GROUP_OF.set(x, [...new Set([...(GROUP_OF.get(x) ?? []), ...g])]);

/** Everything a person might type to find this call, folded. */
function haystack(call: Call): { stems: Set<string>; text: string; disciplines: Set<string> } {
  const places = new Set<string>();
  const addPlace = (id: string | null | undefined) => id && territoryAncestors(id).forEach((a) => a !== "WORLD" && places.add(territoryName(a)));
  call.territories.forEach(addPlace);
  if (call.region) {
    places.add(call.region);
    addPlace(normalizeTerritory(call.region, { prefer: "broadest" }).id);
  }
  const disc = call.disciplines.flatMap((d) => (isDisciplineId(d) ? disciplineAncestors(d) : normalizeDiscipline(d).ids.flatMap(disciplineAncestors)));
  const text = fold(
    [
      call.title,
      call.summary,
      call.organizer,
      call.type,
      call.scope,
      call.amountText,
      ...places,
      ...call.eligibility.residence,
      ...call.beneficiaryTypes,
      ...call.sectors,
      ...call.disciplines,
      ...disc.map((d) => disciplineLabel(d)),
    ].join(" "),
  );
  return { stems: new Set(words(text).map(stem)), text, disciplines: new Set(disc) };
}

/** Meaningful query words, folded ("Becas en la Deputación" → ["becas", "deputacion"]). */
export function queryTokens(q: string | undefined): string[] {
  return q ? words(q).filter((w) => !STOP.has(w)) : [];
}

function tokenMatches(token: string, hay: ReturnType<typeof haystack>): boolean {
  const variants = new Set([token, ...(GROUP_OF.get(token) ?? GROUP_OF.get(stem(token)) ?? [])]);
  for (const v of variants) {
    if (v.includes(" ")) {
      if (hay.text.includes(v)) return true;
      continue;
    }
    const sv = stem(v);
    if (hay.stems.has(sv)) return true;
    if (sv.length >= 5 && [...hay.stems].some((w) => w.startsWith(sv))) return true;
  }
  // "pintora", "fotógrafo", "artes plásticas" → discipline ids: a call for that discipline (or its family) matches.
  const ids = normalizeDiscipline(token).ids;
  return ids.some((id) => hay.disciplines.has(id));
}

/** Does the call match every meaningful word of the query? An empty query matches everything. */
export function matchesQuery(call: Call, q: string | undefined): boolean {
  const tokens = queryTokens(q);
  if (!tokens.length) return true;
  const hay = haystack(call);
  return tokens.every((t) => tokenMatches(t, hay));
}
