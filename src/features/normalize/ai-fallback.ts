/**
 * Optional AI fallback for free text the dictionaries could not map (e.g. "arte textil sostenible").
 * Rules:
 * - Only for soft vocabularies (disciplines, documents). Territory and beneficiary type decide
 *   eligibility, so they are never resolved by AI.
 * - Suggestions are filtered to valid taxonomy ids and flagged `suggested: true`; callers may use them for
 *   the fit score or UI hints, never to accept or reject a call.
 * - The default resolver is a deterministic mock (token overlap with labels), so tests never call a model.
 * A real implementation (Claude fast tier, structured output = id list) can be plugged in by WP-05/06.
 */
import { taxonomy, DISCIPLINE_IDS, DOCUMENT_IDS } from "./taxonomy";
import { keyOf, unique } from "./text";

export type SoftVocabulary = "discipline" | "document";

export interface UnmappedResolver {
  suggest(input: { vocabulary: SoftVocabulary; text: string; allowedIds: readonly string[] }): Promise<string[]>;
}

export interface Suggestion {
  text: string;
  ids: string[];
  suggested: true;
}

function labelsFor(vocabulary: SoftVocabulary): { id: string; words: Set<string> }[] {
  const items = vocabulary === "discipline" ? taxonomy.disciplines.items : taxonomy.documents.items;
  return items.map((i) => ({
    id: i.id,
    words: new Set([i.label.es, i.label.gl, ...i.synonyms].flatMap((p) => keyOf(p).split(" ")).filter((w) => w.length >= 4)),
  }));
}

/** Deterministic mock: the taxonomy entries sharing the most ≥4-letter words with the text (ties → all). */
export const mockUnmappedResolver: UnmappedResolver = {
  async suggest({ vocabulary, text }) {
    const words = keyOf(text).split(" ").filter((w) => w.length >= 4);
    let best = 0;
    let ids: string[] = [];
    for (const l of labelsFor(vocabulary)) {
      const score = words.filter((w) => l.words.has(w)).length;
      if (score > best) {
        best = score;
        ids = [l.id];
      } else if (score === best && score > 0) ids.push(l.id);
    }
    return ids;
  },
};

export async function suggestForUnmapped(vocabulary: SoftVocabulary, texts: readonly string[], resolver: UnmappedResolver = mockUnmappedResolver): Promise<Suggestion[]> {
  const allowedIds = vocabulary === "discipline" ? DISCIPLINE_IDS : DOCUMENT_IDS;
  const out: Suggestion[] = [];
  for (const text of texts) {
    let ids: string[] = [];
    try {
      ids = unique((await resolver.suggest({ vocabulary, text, allowedIds })).filter((id) => allowedIds.includes(id)));
    } catch {
      ids = []; // a failing model never breaks normalisation
    }
    out.push({ text, ids, suggested: true });
  }
  return out;
}
