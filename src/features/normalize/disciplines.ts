/** Creator discipline taxonomy: free text (es/gl, any case/accents, plurals, typos) → stable ids. */
import { taxonomy } from "./taxonomy";
import { PhraseMatcher, type MatchVia, splitConjunctions, splitList, unique } from "./text";

const items = taxonomy.disciplines.items;
const byId = new Map(items.map((d) => [d.id, d]));
const ANY = "__any__";

const matcher = new PhraseMatcher([
  ...items.map((d) => ({ id: d.id, phrases: [d.id.replace(/-/g, " "), d.label.es, d.label.gl, ...d.synonyms] })),
  { id: ANY, phrases: taxonomy.disciplines.anyPhrases },
]);

export interface DisciplineResult {
  ids: string[]; // taxonomy ids, input order, deduped
  any: boolean; // the text says "any discipline" ("todas las disciplinas", "multidisciplinar")
  unmapped: string[]; // input fragments we could not map
  matches: { input: string; id: string; via: MatchVia }[];
}

/**
 * Map a discipline label or list to taxonomy ids.
 * Strategy per list item: exact → phrase scan → split on "y/e/o" and retry → typo-tolerant match.
 * Accepts a string ("pintura, escultura e instalación") or an array of strings.
 */
export function normalizeDiscipline(input: string | readonly string[]): DisciplineResult {
  const parts = (typeof input === "string" ? [input] : input).flatMap(splitList);
  const res: DisciplineResult = { ids: [], any: false, unmapped: [], matches: [] };
  const add = (part: string, hits: { id: string; via: MatchVia }[]) => {
    for (const h of hits) {
      if (h.id === ANY) {
        res.any = true;
        continue;
      }
      res.matches.push({ input: part, id: h.id, via: h.via });
      res.ids.push(h.id);
    }
  };
  for (const part of parts) {
    let hits = matcher.exact(part);
    if (!hits.length) hits = matcher.scan(part);
    if (!hits.length) {
      const sub = splitConjunctions(part);
      if (sub.length > 1) {
        const subHits = sub.map((s) => {
          const h = matcher.exact(s);
          return h.length ? h : matcher.fuzzy(s);
        });
        hits = subHits.flat();
        sub.forEach((s, i) => {
          if (!subHits[i].length) res.unmapped.push(s);
        });
        add(part, hits);
        continue;
      }
    }
    if (!hits.length) hits = matcher.fuzzy(part);
    if (hits.length) add(part, hits);
    else res.unmapped.push(part);
  }
  res.ids = unique(res.ids);
  return res;
}

/**
 * Find disciplines mentioned anywhere in a longer text (call title/summary). Phrase scan only, no typo
 * correction, so it never invents a discipline from noise.
 */
export function extractDisciplines(text: string): DisciplineResult {
  const hits = matcher.scan(text);
  return {
    ids: unique(hits.filter((h) => h.id !== ANY).map((h) => h.id)),
    any: hits.some((h) => h.id === ANY),
    unmapped: [],
    matches: hits.filter((h) => h.id !== ANY).map((h) => ({ input: text, id: h.id, via: h.via })),
  };
}

export function disciplineLabel(id: string, lang: "es" | "gl" = "es"): string {
  return byId.get(id)?.label[lang] ?? id;
}

export function isDisciplineId(id: string): boolean {
  return byId.has(id);
}

/** [id, parent, grandparent…] */
export function disciplineAncestors(id: string): string[] {
  const out: string[] = [];
  for (let cur = byId.get(id); cur; cur = cur.parent ? byId.get(cur.parent) : undefined) out.push(cur.id);
  return out;
}

export function disciplineChildren(id: string): string[] {
  return items.filter((d) => d.parent === id).map((d) => d.id);
}

/** CNAE codes that bridge disciplines to business sectors (e.g. fotografía → 74.20, 90.12). */
export function disciplinesToCnae(ids: readonly string[]): string[] {
  return unique(ids.flatMap((id) => byId.get(id)?.cnae ?? []));
}

export type DisciplineFit = "any" | "exact" | "within" | "related" | "none";

/**
 * How a profile's disciplines relate to a call's.
 * - any: call has no discipline restriction.
 * - exact: same id on both sides.
 * - within: profile discipline is a child of a call discipline (pintura ⊂ artes-visuales): full fit.
 * - related: profile is broader than the call (artes-visuales vs fotografía) or a sibling: partial fit, confirm.
 * - none: different families.
 */
export function disciplineFit(profileIds: readonly string[], callIds: readonly string[]): { fit: DisciplineFit; matched: string[] } {
  if (!callIds.length) return { fit: "any", matched: [] };
  const exact = profileIds.filter((p) => callIds.includes(p));
  if (exact.length) return { fit: "exact", matched: exact };
  const within = profileIds.filter((p) => disciplineAncestors(p).some((a) => callIds.includes(a)));
  if (within.length) return { fit: "within", matched: within };
  const related = profileIds.filter((p) => {
    const pFamily = disciplineAncestors(p).at(-1);
    return callIds.some((c) => disciplineAncestors(c).includes(p) || disciplineAncestors(c).at(-1) === pFamily);
  });
  if (related.length) return { fit: "related", matched: related };
  return { fit: "none", matched: [] };
}
