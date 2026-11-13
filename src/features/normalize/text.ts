/**
 * Text folding and a small phrase matcher shared by every vocabulary.
 * Everything here is pure and deterministic: same input, same output, no I/O.
 */

/** Lowercase, strip accents (á→a, ñ→n, ç→c), turn punctuation into spaces and collapse whitespace. */
export function fold(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Rough Spanish/Galician singular for matching only (never shown to users).
 * "ilustraciones"→"ilustracion", "artes"→"arte", "escenicas"→"escenica", "pymes"→"pyme".
 * Applied to both sides of every comparison, so imperfect stems are harmless.
 */
export function singular(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  if (word.endsWith("ces")) return word.slice(0, -3) + "z";
  if (/[^aeiou]es$/.test(word) && word.length > 4) {
    const stem = word.slice(0, -2);
    // "pymes", "artes", "clases": the stem ends in a consonant cluster Spanish words don't end with
    if (/(m|t|s|p|b|g|f|v|c)$/.test(stem)) return word.slice(0, -1);
    return stem;
  }
  if (/[aeiou]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Folded + singularised key used for dictionary lookups. */
export function keyOf(input: string): string {
  return fold(input)
    .split(" ")
    .filter(Boolean)
    .map(singular)
    .join(" ");
}

/** Classic Levenshtein distance with an early exit once `max` is exceeded. */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Allowed typo distance for a key of this length (0 for short words: "pop" must not match "pos"). */
export function typoBudget(length: number): number {
  if (length >= 9) return 2;
  if (length >= 5) return 1;
  return 0;
}

export interface PhraseEntry {
  id: string;
  phrases: string[];
  /** Phrases that only match a whole input, never inside a longer text (e.g. "nacional"). */
  exactOnly?: string[];
}

export type MatchVia = "exact" | "phrase" | "fuzzy";

export interface PhraseHit {
  id: string;
  phrase: string; // folded key that matched
  via: MatchVia;
}

/**
 * Dictionary of phrases → ids with three strategies, tried in order by callers:
 * exact (whole input equals a phrase), scan (phrases found inside the text, longest wins)
 * and fuzzy (small typos on whole input / single words).
 */
export class PhraseMatcher {
  private readonly exactIndex = new Map<string, string[]>();
  private readonly scanList: { key: string; id: string }[] = [];

  constructor(entries: PhraseEntry[]) {
    for (const e of entries) {
      const exactOnly = new Set((e.exactOnly ?? []).map(keyOf));
      for (const p of [...e.phrases, ...(e.exactOnly ?? [])]) {
        const k = keyOf(p);
        if (!k) continue;
        const ids = this.exactIndex.get(k) ?? [];
        if (!ids.includes(e.id)) ids.push(e.id);
        this.exactIndex.set(k, ids);
        if (!exactOnly.has(k) && !this.scanList.some((s) => s.key === k && s.id === e.id)) this.scanList.push({ key: k, id: e.id });
      }
    }
    // Longest first so dominance checks see the most specific phrase first.
    this.scanList.sort((a, b) => b.key.length - a.key.length);
  }

  exact(text: string): PhraseHit[] {
    const k = keyOf(text);
    return (this.exactIndex.get(k) ?? []).map((id) => ({ id, phrase: k, via: "exact" as const }));
  }

  /** Phrases contained (on word boundaries) in the text. A phrase inside a longer matched phrase is dropped. */
  scan(text: string): PhraseHit[] {
    const hay = ` ${keyOf(text)} `;
    const taken: { start: number; end: number }[] = [];
    const hits: (PhraseHit & { at: number })[] = [];
    for (const { key, id } of this.scanList) {
      let from = 0;
      for (;;) {
        const at = hay.indexOf(` ${key} `, from);
        if (at < 0) break;
        const span = { start: at + 1, end: at + 1 + key.length };
        const overlapped = taken.some((t) => span.start >= t.start && span.end <= t.end && !(t.start === span.start && t.end === span.end));
        if (!overlapped) {
          taken.push(span);
          if (!hits.some((h) => h.id === id)) hits.push({ id, phrase: key, via: "phrase", at: span.start });
        }
        from = at + 1;
      }
    }
    // Report in reading order, not in phrase-length order.
    return hits.sort((a, b) => a.at - b.at).map(({ at: _at, ...h }) => h);
  }

  /** Whole-input typo match, then per-word typo match against single-word phrases. Unique best only. */
  fuzzy(text: string): PhraseHit[] {
    const k = keyOf(text);
    if (!k) return [];
    const best = this.closest(k, typoBudget(k.replace(/ /g, "").length));
    if (best.length) return best;
    const hits: PhraseHit[] = [];
    for (const w of k.split(" ")) {
      if (w.length < 5) continue;
      for (const h of this.closest(w, typoBudget(w.length), true)) if (!hits.some((x) => x.id === h.id)) hits.push(h);
    }
    return hits;
  }

  private closest(k: string, budget: number, singleWordOnly = false): PhraseHit[] {
    if (budget === 0) return [];
    let bestD = budget + 1;
    let found: PhraseHit[] = [];
    for (const [phrase, ids] of this.exactIndex) {
      if (singleWordOnly && phrase.includes(" ")) continue;
      if (Math.abs(phrase.length - k.length) > budget) continue;
      // Never "correct" a phrase shorter than 5 letters: too many false friends.
      if (phrase.replace(/ /g, "").length < 5) continue;
      const d = levenshtein(k, phrase, budget);
      if (d < bestD) {
        bestD = d;
        found = ids.map((id) => ({ id, phrase, via: "fuzzy" as const }));
      } else if (d === bestD) {
        for (const id of ids) if (!found.some((f) => f.id === id)) found.push({ id, phrase, via: "fuzzy" });
      }
    }
    return bestD <= budget ? found : [];
  }
}

/** Split a free-text list ("pintura, escultura; foto") into items. Keeps "y"/"e" joins for a second pass. */
export function splitList(input: string): string[] {
  return input
    .split(/[,;|\n\/·•]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Split a list item on Spanish/Galician conjunctions ("pintura y escultura", "música e danza"). */
export function splitConjunctions(input: string): string[] {
  return input
    .split(/\s+(?:y|e|o|ou|and|or)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function unique<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)];
}
