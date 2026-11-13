/**
 * Dates: ISO YYYY-MM-DD strings, computed in UTC (no time-zone drift), plus a deadline resolver for the
 * free text BDNS gives when fechaFinSolicitud is null ("20 días hábiles desde el día siguiente al de la
 * publicación en el BOP"). Plazos follow Ley 39/2015, art. 30:
 * - días hábiles exclude Saturdays, Sundays and holidays; counting starts the day after publication;
 * - días naturales: if the last day is inhábil, the plazo ends the next día hábil;
 * - meses: end on the same day number in the target month (last day of month if it does not exist),
 *   moved to the next día hábil if inhábil.
 * Limits: only national + regional holidays in data/taxonomy/holidays.json (2026–2027; Galicia), no local
 * holidays. Results computed from text are always `estimated: true`.
 */
import { taxonomy } from "./taxonomy";
import type { Deadline } from "./types";

const DAY = 86_400_000;
const { national, regional, coverage } = taxonomy.holidays;

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return toIso(new Date(parseIso(iso).getTime() + n * DAY));
}

/** Regions are NUTS2 codes (e.g. "ES11"); a call's regional holidays apply to its procedure. */
export function holidaysFor(year: number, regions: readonly string[] = []): Set<string> {
  const out = new Set(national[String(year)] ?? []);
  for (const r of regions) for (const d of regional[r]?.[String(year)] ?? []) out.add(d);
  return out;
}

export function isCalendarCovered(iso: string): boolean {
  return iso >= coverage.from && iso <= coverage.to;
}

export function isBusinessDay(iso: string, regions: readonly string[] = []): boolean {
  const d = parseIso(iso);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !holidaysFor(d.getUTCFullYear(), regions).has(iso);
}

export function nextBusinessDay(iso: string, regions: readonly string[] = []): string {
  let cur = iso;
  while (!isBusinessDay(cur, regions)) cur = addDays(cur, 1);
  return cur;
}

/** The Nth día hábil after `fromIso` (the start day itself is not counted). */
export function addBusinessDays(fromIso: string, n: number, regions: readonly string[] = []): string {
  let cur = fromIso;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur, regions)) left--;
  }
  return cur;
}

/** Art. 30.4: same day number N months later, clamped to the month's last day. */
export function addMonths(fromIso: string, n: number): string {
  const d = parseIso(fromIso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIso(target);
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, dous: 2, tres: 3, cuatro: 4, catro: 4, cinco: 5, seis: 6, siete: 7, sete: 7, ocho: 8, oito: 8,
  nueve: 9, nove: 9, diez: 10, dez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, dezaseis: 16, diecisiete: 17, dezasete: 17, dieciocho: 18, dezaoito: 18, diecinueve: 19, dezanove: 19,
  veinte: 20, vinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, trinta: 30, cuarenta: 40, corenta: 40,
  cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "20", "veinte", "cuarenta y cinco", "vinte e cinco" → number. */
export function parseNumberWord(text: string): number | null {
  const t = fold(text).trim();
  if (/^\d+$/.test(t)) return Number(t);
  const parts = t.split(/\s+(?:y|e)\s+/);
  let total = 0;
  for (const p of parts) {
    const v = NUMBER_WORDS[p];
    if (v === undefined) return null;
    total += v;
  }
  return total || null;
}

const MONTHS: Record<string, number> = {
  enero: 1, xaneiro: 1, febrero: 2, febreiro: 2, marzo: 3, abril: 4, mayo: 5, maio: 5, junio: 6, xuno: 6, julio: 7, xullo: 7,
  agosto: 8, septiembre: 9, setiembre: 9, setembro: 9, octubre: 10, outubro: 10, noviembre: 11, novembro: 11,
  diciembre: 12, decembro: 12, nadal: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return toIso(parseIso(iso)) === iso ? iso : null;
}

/** Explicit dates in a text, in order: ISO, dd/mm/yyyy, dd-mm-yy, "15 de enero de 2027", "15 de xaneiro". */
export function findDates(text: string, referenceYear?: number): { iso: string; yearInferred: boolean; index: number }[] {
  const f = fold(text);
  const out: { iso: string; yearInferred: boolean; index: number }[] = [];
  for (const m of f.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const iso = validDate(+m[1], +m[2], +m[3]);
    if (iso) out.push({ iso, yearInferred: false, index: m.index! });
  }
  for (const m of f.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/g)) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const iso = validDate(y, +m[2], +m[1]);
    if (iso) out.push({ iso, yearInferred: false, index: m.index! });
  }
  const monthNames = Object.keys(MONTHS).join("|");
  for (const m of f.matchAll(new RegExp(String.raw`\b(\d{1,2})\s+de\s+(${monthNames})(?:\s+(?:de|del)\s+(\d{4}))?`, "g"))) {
    const year = m[3] ? +m[3] : referenceYear;
    if (!year) continue;
    const iso = validDate(year, MONTHS[m[2]], +m[1]);
    if (iso) out.push({ iso, yearInferred: !m[3], index: m.index! });
  }
  return out.sort((a, b) => a.index - b.index);
}

export type DeadlineRule =
  | { kind: "date"; iso: string; yearInferred: boolean }
  | { kind: "business-days" | "calendar-days" | "months"; n: number; anchor: "publication" | "other" }
  | { kind: "rolling" }
  | { kind: "unknown" };

const NUM_PHRASE = String.raw`(\d+|[a-z]+(?:\s+(?:y|e)\s+[a-z]+)?)`;

/** Read what kind of plazo a textFin describes, without resolving it. */
export function parseDeadlineText(text: string | null | undefined, referenceYear?: number): DeadlineRule {
  if (!text || !text.trim()) return { kind: "unknown" };
  const f = fold(text);
  const anchor: "publication" | "other" =
    /(notificaci|comunicaci|resolucion de concesion|inicio de la actividad|finalizacion|realizacion de la actividad|celebracion)/.test(f) &&
    !/(publicaci|boletin|\bbo[a-z]{0,3}\b|\bdog\b|\bboe\b|extracto)/.test(f)
      ? "other"
      : "publication";
  // "20 días hábiles", "veinte (20) días hábiles", "quince días naturales", "un mes", "dous meses"
  for (const dur of f.matchAll(new RegExp(String.raw`\b${NUM_PHRASE}(?:\s*\(\d+\))?\s+(dias?|mes(?:es)?)\b\s*(habiles|naturales|naturais|habil|natural)?`, "g"))) {
    const n = parseNumberWord(dur[1]);
    if (!n) continue;
    if (dur[2].startsWith("mes")) return { kind: "months", n, anchor };
    return { kind: dur[3]?.startsWith("natura") ? "calendar-days" : "business-days", n, anchor };
  }
  const dates = findDates(text, referenceYear);
  if (dates.length) {
    const last = dates[dates.length - 1]; // "del 1/10 al 31/10" → the end
    return { kind: "date", iso: last.iso, yearInferred: last.yearInferred };
  }
  if (/(sin plazo|sen prazo|todo el ano|todo o ano|abierta? (de forma )?permanente|hasta agotar|ata esgotar|convocatoria abierta|plazo abierto|ventanilla abierta)/.test(f))
    return { kind: "rolling" };
  return { kind: "unknown" };
}

export interface ResolveDeadlineOptions {
  /** Structured end date if the source has one (BDNS fechaFinSolicitud): wins over text. */
  explicitDate?: string | null;
  /** NUTS2 regions whose holidays count as inhábiles (the call's comunidad autónoma). */
  regions?: readonly string[];
}

/**
 * Resolve a deadline to {date, estimated}.
 * resolveDeadline("20 días hábiles desde el día siguiente a la publicación en el BOP", "2026-11-13", { regions: ["ES11"] })
 * → { date: "2026-12-14", estimated: true, method: "business-days" }.
 */
export function resolveDeadline(textFin: string | null | undefined, publicationDate: string | null | undefined, opts: ResolveDeadlineOptions = {}): Deadline {
  const regions = opts.regions ?? [];
  if (opts.explicitDate) return { date: opts.explicitDate.slice(0, 10), estimated: false, method: "explicit-field" };
  const refYear = publicationDate ? parseIso(publicationDate).getUTCFullYear() : undefined;
  const rule = parseDeadlineText(textFin, refYear);
  switch (rule.kind) {
    case "date": {
      let iso = rule.iso;
      // "hasta el 15 de enero" published in November → next year's 15 January.
      if (rule.yearInferred && publicationDate && iso < publicationDate.slice(0, 10)) iso = `${+iso.slice(0, 4) + 1}${iso.slice(4)}`;
      return { date: iso, estimated: rule.yearInferred, method: "explicit-text", ...(rule.yearInferred ? { note: "Año deducido de la fecha de publicación" } : {}) };
    }
    case "rolling":
      return { date: null, estimated: false, method: "rolling", note: "Sin plazo cerrado (abierta o hasta agotar crédito)" };
    case "unknown":
      return { date: null, estimated: false, method: "unresolved", note: textFin ? "No se reconoce el plazo en el texto" : "Sin texto de plazo" };
    default: {
      if (rule.anchor === "other")
        return { date: null, estimated: false, method: "unresolved", note: "El plazo cuenta desde un hecho distinto de la publicación (notificación, comunicación…)" };
      if (!publicationDate) return { date: null, estimated: false, method: "unresolved", note: "Falta la fecha de publicación para calcular el plazo" };
      const pub = publicationDate.slice(0, 10);
      let date: string;
      if (rule.kind === "business-days") date = addBusinessDays(pub, rule.n, regions);
      else if (rule.kind === "calendar-days") date = nextBusinessDay(addDays(pub, rule.n), regions);
      else date = nextBusinessDay(addMonths(pub, rule.n), regions);
      const note = isCalendarCovered(date)
        ? "Calculado desde la publicación; no incluye festivos locales"
        : "Calculado fuera del calendario de festivos cargado (solo fines de semana)";
      return { date, estimated: true, method: rule.kind, note };
    }
  }
}

/** Whole days from `fromIso` to `toIso` (negative if past). */
export function daysBetween(fromIso: string, toIsoDate: string): number {
  return Math.round((parseIso(toIsoDate).getTime() - parseIso(fromIso).getTime()) / DAY);
}
