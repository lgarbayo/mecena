/**
 * Art family of a creator, from their free-text disciplines ("guitarrista", "danza contemporánea", "poesía").
 * Uses the top-level families of data/taxonomy/disciplines.json and their synonyms, so the interview,
 * follow-up questions and the "what's next" step speak the language of each art.
 *
 * TODO(contracts): switch to `artFamily` from @/contracts (src/contracts/arts.ts) once it lands, and delete this helper.
 */
import disciplinesJson from "../../../data/taxonomy/disciplines.json";

export const ART_FAMILIES = ["artes-visuales", "musica", "artes-escenicas", "audiovisual", "literatura", "diseno", "artesania", "gestion-cultural"] as const;
export type OnboardingArtFamily = (typeof ART_FAMILIES)[number];

interface Item {
  id: string;
  parent: string | null;
  label: { es: string; gl: string };
  synonyms?: string[];
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();

const items = (disciplinesJson as { items: Item[] }).items;
const byId = new Map(items.map((d) => [d.id, d]));

function topFamily(id: string): OnboardingArtFamily | undefined {
  let cur = byId.get(id);
  while (cur?.parent) cur = byId.get(cur.parent);
  return cur && (ART_FAMILIES as readonly string[]).includes(cur.id) ? (cur.id as OnboardingArtFamily) : undefined;
}

/** Every phrase (id, labels, synonyms) folded, longest first so "musica electronica" wins over "musica". */
const PHRASES: { phrase: string; family: OnboardingArtFamily }[] = items
  .flatMap((d) => {
    const family = topFamily(d.id);
    if (!family) return [];
    return [d.id.replace(/-/g, " "), d.label.es, d.label.gl, ...(d.synonyms ?? [])].map((p) => ({ phrase: fold(p), family }));
  })
  .filter((p) => p.phrase.length > 1)
  .sort((a, b) => b.phrase.length - a.phrase.length);

/** Words the taxonomy does not list but people say about themselves (instruments, roles). */
const EXTRA: [RegExp, OnboardingArtFamily][] = [
  [/\b(guitarr\w*|pian\w*|violin\w*|violonchel\w*|bater\w*|baj\w*sta|saxof\w*|trompet\w*|cantautor\w*|rapero|rapera|banda|grupo|cancion\w*|disco|discos)\b/, "musica"],
  [/\b(actriz|actor|actores|escena|escenico|escenica|acrobat\w*|funambul\w*|clown|payas\w*)\b/, "artes-escenicas"],
  [/\b(cine|cortos?|cortometrajes?|realizador\w*|directora?|filme\w*)\b/, "audiovisual"],
  [/\b(literatura|libros?|poemas?|poemarios?|novelas?|cuentos?|relatos?)\b/, "literatura"],
];

function familyOfOne(discipline: string): OnboardingArtFamily | undefined {
  const f = ` ${fold(discipline)} `;
  if (!f.trim()) return undefined;
  for (const { phrase, family } of PHRASES) if (f.includes(` ${phrase} `)) return family;
  // Plural/feminine tolerance: "bailarinas", "poetas".
  for (const { phrase, family } of PHRASES) if (phrase.length > 4 && new RegExp(` ${phrase}(s|es|a|as)? `).test(f)) return family;
  return EXTRA.find(([re]) => re.test(f))?.[1];
}

/**
 * The creator's main family: the one their first mappable discipline belongs to.
 * Undefined when nothing maps (the interview then stays art-neutral).
 */
export function onboardingFamily(disciplines: readonly string[] | undefined): OnboardingArtFamily | undefined {
  for (const d of disciplines ?? []) {
    const fam = familyOfOne(d);
    if (fam) return fam;
  }
  return undefined;
}

/** Families whose work is mostly not an object you photograph: the next step talks about photos of shows and links. */
export function isVisualFamily(family: OnboardingArtFamily | undefined): boolean {
  return family === undefined || family === "artes-visuales" || family === "diseno" || family === "artesania";
}
