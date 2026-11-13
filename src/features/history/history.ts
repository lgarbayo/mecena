/**
 * Past-editions history of a call (B3), built from BDNS awards (concesiones) and official resolutions.
 * Evidence for "how competitive is this call and who wins it", never a fake probability: BDNS lists
 * winners only, so a success rate exists only when a published resolution gives the number of applicants.
 * Pure and deterministic; the BDNS calls live in scripts/ingest-history.ts.
 * Privacy: natural persons' names and ids are used in memory (repeat counts) and never stored or exported.
 */
import { z } from "zod";
import type { PastAward } from "@/contracts/domain";
import { BeneficiaryType } from "@/features/normalize/taxonomy";
import { fold, singular } from "@/features/normalize/text";

/** One row of GET /concesiones/busqueda (fields we use). */
export const BdnsAward = z
  .object({
    codConcesion: z.union([z.string(), z.number()]).transform(String),
    idPersona: z.number(),
    beneficiario: z.string(), // "***1768** NAME" natural person; "B12345678 NAME" entity
    importe: z.number().nullish(),
    fechaConcesion: z.string().nullish(),
  })
  .passthrough();
export type BdnsAward = z.infer<typeof BdnsAward>;

/** Hand-curated from a published resolution (DOG / BOP / BOE / organiser site): the only source of applicants and cutoff. */
export const Resolution = z.object({
  bdnsId: z.string(), // edition the resolution belongs to
  applicants: z.number().int().positive().optional(),
  awarded: z.number().int().nonnegative().optional(), // as listed in the resolution; BDNS may add later top-ups
  cutoffScore: z.number().optional(), // score of the last awarded application
  maxScore: z.number().optional(),
  sourceUrl: z.string().url(),
  note: z.string().optional(),
});
export type Resolution = z.infer<typeof Resolution>;

/** Natural persons ("persona") cannot be split into persona-fisica / autonomo from BDNS: both are counted together. */
export const WinnerType = z.union([BeneficiaryType, z.literal("persona")]);
export type WinnerType = z.infer<typeof WinnerType>;

export const EditionStats = z.object({
  bdnsId: z.string(),
  date: z.string(), // fechaRecepcion of the edition's call
  title: z.string(),
  awards: z.number().int(),
  amountTotalEur: z.number(),
  amountMinEur: z.number().optional(),
  amountMaxEur: z.number().optional(),
  winners: z.record(z.string(), z.number().int()), // WinnerType | "desconocido" → count
});
export type EditionStats = z.infer<typeof EditionStats>;

export const CallHistory = z.object({
  callId: z.string(),
  bdnsId: z.string(),
  editionsFound: z.number().int(), // past editions linked in BDNS (current one excluded)
  editionsWithAwards: z.number().int(),
  awardsPerEdition: z.number().optional(), // median over editions with awards
  amountRangeEur: z.object({ min: z.number(), max: z.number() }).optional(),
  winners: z.record(z.string(), z.number().int()).optional(), // summed over editions
  repeatWinnerShare: z.number().optional(), // distinct winners with 2+ editions / distinct winners; needs 2+ editions with awards
  successRate: z.object({ awarded: z.number(), applicants: z.number(), rate: z.number(), bdnsId: z.string() }).optional(),
  cutoff: z.object({ score: z.number(), maxScore: z.number().optional(), bdnsId: z.string(), sourceUrl: z.string() }).optional(),
  cutoffRange: z.object({ min: z.number(), max: z.number(), editions: z.number().int() }).optional(), // needs 2+ resolutions
  editions: z.array(EditionStats),
  evidence: z.string(), // es-ES, shown next to the numbers
  builtAt: z.string(),
});
export type CallHistory = z.infer<typeof CallHistory>;

const NOISE = new Set([
  // edition / procedure words that change between editions
  "base", "convocatoria", "aprobacion", "edicion", "ed", "anuncio", "extracto", "resolucion", "acuerdo", "concesion",
  "reguladora", "especifica", "junta", "gobierno", "local", "ano",
  // dates inside titles ("Resolución de 12 de noviembre de 2026…"), es + gl
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre", "octubre", "noviembre", "diciembre",
  "xaneiro", "febreiro", "maio", "xuno", "xullo", "setembro", "outubro", "novembro", "decembro",
  // articles / prepositions (es + gl)
  "de", "del", "la", "las", "el", "los", "y", "e", "a", "en", "para", "por", "con", "da", "do", "das", "dos", "o", "as", "os", "que", "al", "se",
]);
const GENERIC = new Set(["premio", "concurso", "certamen", "ayuda", "subvencion", "beca", "convocan"]); // too common to search with
const ROMAN = /^[ivxlcdm]+$/;

const keyWord = (w: string) => singular(fold(w));

/**
 * Distinctive, edition-independent tokens of a title (folded, singular). Type words (premio, certamen, concurso…)
 * are dropped too: organisers switch them between editions ("XXXII Premio López-Villaseñor" → "XXXIV Certamen …").
 */
export function titleCoreTokens(title: string): string[] {
  const out: string[] = [];
  for (const raw of fold(title).split(" ")) {
    const t = singular(raw);
    if (t.length < 2 || NOISE.has(t) || GENERIC.has(t) || ROMAN.test(t) || /\d/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

function isDistinctive(word: string): boolean {
  const t = keyWord(word);
  return t.length >= 3 && !NOISE.has(t) && !GENERIC.has(t) && !ROMAN.test(t) && !/\d/.test(t);
}

/**
 * BDNS search matches a substring of the description, ignoring case and accents but not "ñ" or separators.
 * Queries are exact slices of the original title: pairs of adjacent distinctive words ("Manuel Lueiro",
 * "LÓPEZ-VILLASEÑOR"), rare enough to return few results. Falls back to the longest single word.
 */
export function searchTerms(title: string, max = 2): string[] {
  const words = [...title.matchAll(/[\p{L}\p{N}]+/gu)];
  const pairs: string[] = [];
  for (let i = 0; i + 1 < words.length; i++) {
    const [a, b] = [words[i], words[i + 1]];
    const gap = title.slice(a.index! + a[0].length, b.index);
    if (isDistinctive(a[0]) && isDistinctive(b[0]) && /^[\s-]$/.test(gap)) pairs.push(title.slice(a.index, b.index! + b[0].length));
  }
  if (pairs.length) return [...new Set(pairs)].sort((x, y) => y.length - x.length).slice(0, max);
  return words.map((w) => w[0]).filter((w) => isDistinctive(w) && w.length >= 4).sort((x, y) => y.length - x.length).slice(0, 1);
}

/**
 * Same series = same organizer (BDNS nivel3 ?? nivel2) and every core token of the shorter title appears in the longer
 * one (old editions have short titles, new ones long boilerplate). Needs 2+ tokens to avoid trivial matches.
 * Strict on purpose: "Premio de Poesía Manuel Lueiro Rey" must not link "Premio de Periodismo Manuel Lueiro Rey".
 */
export function isSameSeries(current: { title: string; organizer: string }, candidate: { title: string; organizer: string }): boolean {
  if (fold(current.organizer) !== fold(candidate.organizer)) return false;
  // BDNS keeps cancelled records ("ANULADA …", "*** ANULADA ***"), usually re-registered under a new id: not an edition.
  if (/\banulad[ao]\b/.test(fold(candidate.title))) return false;
  const [a, b] = [titleCoreTokens(current.title), titleCoreTokens(candidate.title)];
  const [short, long] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  return short.length >= 2 && short.every((t) => long.has(t));
}

/**
 * Winner type from the published NIF (Orden EHA/451/2008 first letter). Masked DNI/NIE ("***1234**") = natural person.
 * A–D, F (sociedades, cooperativas) are counted as pyme: BDNS does not give size, and these lines rarely reach large firms.
 */
const NIF_TYPE: Record<string, BeneficiaryType> = {
  A: "pyme", B: "pyme", C: "pyme", D: "pyme", F: "pyme",
  G: "entidad-sin-animo-lucro", R: "entidad-sin-animo-lucro",
  E: "colectivo", J: "colectivo", U: "colectivo",
  P: "entidad-publica", Q: "entidad-publica", S: "entidad-publica",
};
export function winnerType(beneficiario: string): WinnerType | null {
  const s = beneficiario.trim();
  if (s.startsWith("*")) return "persona";
  const m = /^([A-Z])\d{7}[0-9A-J]?\b/.exec(s);
  return (m && NIF_TYPE[m[1]]) || null;
}

/** "B12345678 PANGUR ANIMATION, COOP. V." → "PANGUR ANIMATION, COOP. V." (entities only). */
function entityName(beneficiario: string): string {
  return beneficiario.trim().replace(/^[A-Z]\d{7}[0-9A-J]?\s+/, "");
}

function countWinners(awards: BdnsAward[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of awards) {
    const k = winnerType(a.beneficiario) ?? "desconocido";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface EditionInput {
  bdnsId: string;
  date: string;
  title: string;
  awards: BdnsAward[];
}

export function editionStats(e: EditionInput): EditionStats {
  const amounts = e.awards.map((a) => a.importe ?? 0).filter((x) => x > 0);
  return {
    bdnsId: e.bdnsId,
    date: e.date,
    title: e.title,
    awards: e.awards.length,
    amountTotalEur: amounts.reduce((s, x) => s + x, 0),
    ...(amounts.length ? { amountMinEur: Math.min(...amounts), amountMaxEur: Math.max(...amounts) } : {}),
    winners: countWinners(e.awards),
  };
}

export function summarizeHistory(input: { callId: string; bdnsId: string; editions: EditionInput[]; resolutions?: Resolution[]; builtAt: string }): CallHistory {
  const sorted = [...input.editions].sort((a, b) => b.date.localeCompare(a.date));
  const stats = sorted.map(editionStats);
  const withAwards = stats.filter((s) => s.awards > 0);

  const h: CallHistory = {
    callId: input.callId,
    bdnsId: input.bdnsId,
    editionsFound: stats.length,
    editionsWithAwards: withAwards.length,
    editions: stats,
    evidence: "",
    builtAt: input.builtAt,
  };

  if (withAwards.length) {
    h.awardsPerEdition = median(withAwards.map((s) => s.awards));
    const mins = withAwards.flatMap((s) => (s.amountMinEur !== undefined ? [s.amountMinEur] : []));
    const maxs = withAwards.flatMap((s) => (s.amountMaxEur !== undefined ? [s.amountMaxEur] : []));
    if (mins.length) h.amountRangeEur = { min: Math.min(...mins), max: Math.max(...maxs) };
    h.winners = {};
    for (const s of withAwards) for (const [k, n] of Object.entries(s.winners)) h.winners[k] = (h.winners[k] ?? 0) + n;
  }

  if (withAwards.length >= 2) {
    const editionsByPerson = new Map<number, number>();
    for (const e of sorted) for (const id of new Set(e.awards.map((a) => a.idPersona))) editionsByPerson.set(id, (editionsByPerson.get(id) ?? 0) + 1);
    const repeated = [...editionsByPerson.values()].filter((n) => n >= 2).length;
    h.repeatWinnerShare = editionsByPerson.size ? repeated / editionsByPerson.size : 0;
  }

  // Latest edition with data wins.
  const res = (input.resolutions ?? [])
    .map((r) => ({ r, s: stats.find((s) => s.bdnsId === r.bdnsId) }))
    .filter((x): x is { r: Resolution; s: EditionStats } => !!x.s)
    .sort((a, b) => b.s.date.localeCompare(a.s.date));
  const awardedOf = (x: (typeof res)[number]) => x.r.awarded ?? x.s.awards;
  const withApplicants = res.find((x) => x.r.applicants && awardedOf(x) > 0);
  if (withApplicants) {
    const awarded = awardedOf(withApplicants);
    const applicants = withApplicants.r.applicants!;
    h.successRate = { awarded, applicants, rate: awarded / applicants, bdnsId: withApplicants.r.bdnsId };
  }
  const cutoffs = res.filter((x) => x.r.cutoffScore !== undefined);
  if (cutoffs.length) {
    const { r } = cutoffs[0];
    h.cutoff = { score: r.cutoffScore!, ...(r.maxScore !== undefined ? { maxScore: r.maxScore } : {}), bdnsId: r.bdnsId, sourceUrl: r.sourceUrl };
    if (cutoffs.length >= 2) {
      const scores = cutoffs.map((x) => x.r.cutoffScore!);
      h.cutoffRange = { min: Math.min(...scores), max: Math.max(...scores), editions: cutoffs.length };
    }
  }

  h.evidence = evidenceText(h);
  return h;
}

/**
 * Share of past winners whose type the profile could have (canonical ids from normalizeProfile).
 * A natural-person profile (persona-fisica / autonomo) matches "persona" winners; others match by id.
 * Undefined when there are no published winners.
 */
export function winnerShareFor(h: CallHistory, profileTypes: BeneficiaryType[]): { compatible: number; total: number; share: number } | undefined {
  if (!h.winners) return undefined;
  const total = Object.values(h.winners).reduce((s, n) => s + n, 0);
  if (!total) return undefined;
  const natural = profileTypes.includes("persona-fisica") || profileTypes.includes("autonomo");
  const compatible = Object.entries(h.winners).reduce(
    (s, [k, n]) => s + ((k === "persona" && natural) || (profileTypes as string[]).includes(k) ? n : 0),
    0,
  );
  return { compatible, total, share: compatible / total };
}

/**
 * PastAward rows (contract, read by store.listAwards) for entity winners only: legal persons' names are
 * published by BDNS; natural persons are never exported.
 */
export function toPastAwards(input: {
  callId: string;
  organizer: string;
  editions: EditionInput[];
  discipline?: string;
  sourceUrlFor: (bdnsId: string) => string;
}): PastAward[] {
  const out: PastAward[] = [];
  for (const e of input.editions) {
    for (const a of e.awards) {
      const t = winnerType(a.beneficiario);
      if (!t || t === "persona") continue;
      out.push({
        id: `bdns-award-${a.codConcesion}`,
        callId: input.callId,
        callTitle: e.title,
        organizer: input.organizer,
        year: Number((a.fechaConcesion ?? e.date).slice(0, 4)),
        beneficiary: entityName(a.beneficiario),
        beneficiaryKind: "business",
        ...(input.discipline ? { discipline: input.discipline } : {}),
        ...(a.importe ? { amountEur: a.importe } : {}),
        sourceUrl: input.sourceUrlFor(e.bdnsId),
      });
    }
  }
  return out;
}

const WINNER_LABEL: Record<string, string> = {
  persona: "personas físicas",
  pyme: "empresas",
  "entidad-sin-animo-lucro": "entidades sin ánimo de lucro",
  colectivo: "agrupaciones",
  "entidad-publica": "entidades públicas",
};
const eur = (n: number) => `${Math.round(n).toLocaleString("es-ES")} €`;
const num = (n: number) => n.toLocaleString("es-ES");

function evidenceText(h: CallHistory): string {
  if (h.editionsFound === 0) return "No hay ediciones anteriores en la BDNS.";
  const parts = [`${h.editionsFound} ${h.editionsFound === 1 ? "edición anterior" : "ediciones anteriores"} en la BDNS; ${h.editionsWithAwards} con premiados publicados.`];
  if (h.awardsPerEdition !== undefined)
    parts.push(h.awardsPerEdition === 1 ? "1 premiado por edición." : `Unos ${num(h.awardsPerEdition)} premiados por edición.`);
  if (h.winners) {
    const total = Object.values(h.winners).reduce((s, n) => s + n, 0);
    const [top, n] = Object.entries(h.winners).sort((a, b) => b[1] - a[1])[0];
    if (WINNER_LABEL[top]) parts.push(`${Math.round((n / total) * 100)} % de los premiados son ${WINNER_LABEL[top]}.`);
  }
  if (h.amountRangeEur) parts.push(`Importes entre ${eur(h.amountRangeEur.min)} y ${eur(h.amountRangeEur.max)}.`);
  if (h.repeatWinnerShare !== undefined) parts.push(`${Math.round(h.repeatWinnerShare * 100)} % de los premiados repite.`);
  if (h.successRate) parts.push(`${h.successRate.awarded} de ${h.successRate.applicants} solicitudes concedidas en la última edición con datos.`);
  if (h.cutoff) parts.push(`Último concedido: ${num(h.cutoff.score)}${h.cutoff.maxScore ? `/${h.cutoff.maxScore}` : ""} puntos.`);
  if (h.cutoffRange) parts.push(`Nota de corte entre ${num(h.cutoffRange.min)} y ${num(h.cutoffRange.max)} en ${h.cutoffRange.editions} ediciones.`);
  if (h.editionsWithAwards < 2 && !h.successRate) parts.push("Muestra pequeña: tómalo como orientación.");
  return parts.join(" ");
}
