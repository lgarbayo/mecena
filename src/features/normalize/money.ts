/** Money: always integer euro cents. Parses Spanish-formatted amounts in free text. */
import type { AmountCents } from "./types";

export function eurosToCents(eur: number): number {
  return Math.round(eur * 100);
}

export function centsToEuros(cents: number): number {
  return cents / 100;
}

/** "12.000 €", "12.000,50 €" in es-ES. */
export function formatCents(cents: number): string {
  const opts: Intl.NumberFormatOptions = cents % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  // Intl es-ES omits the thousands dot for 4-digit numbers; amounts read better with it.
  const n = new Intl.NumberFormat("es-ES", { ...opts, useGrouping: "always" } as Intl.NumberFormatOptions).format(cents / 100);
  return `${n} €`;
}

/**
 * Parse a number written the Spanish way. Dot = thousands, comma = decimals ("12.000,50").
 * Ambiguity rules (documented in DATA-STANDARD §e): "1.500" = 1500; "12.5" = 12.5;
 * "12,000" (single comma + exactly 3 digits) = 12000 (English-style thousands); "1,5" = 1.5.
 */
export function parseSpanishNumber(text: string): number | null {
  const s = text.replace(/[\s  ]/g, "");
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    normalized = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    normalized = parts.length === 2 && parts[1].length !== 3 ? parts.join(".") : parts.join("");
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    normalized = parts.slice(1).every((p) => p.length === 3) ? parts.join("") : parts.length === 2 ? s : parts.join("");
  } else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const MULT: Record<string, number> = { mil: 1e3, millon: 1e6, millones: 1e6 };
// A number: grouped thousands ("12.000", "12 000", "12.000,50") or plain ("12000", "1,5"). Never starts mid-number.
const NUM = String.raw`(?<![\d.,])(\d{1,3}(?:[.\u00a0\u202f ]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d+)*)`;
const MULT_RE = String.raw`(mil|mill[oó]n(?:es)?)?`;
const CUR = String.raw`(€|euros?\b|eur\b)`;
const AMOUNT_RE = new RegExp(String.raw`${NUM}\s*${MULT_RE}\s*(?:de\s+)?${CUR}|€\s*${NUM}`, "gi");
/** "3.000 y 6.000 €", "3.000 € a 6.000 €", "3.000-6.000 euros": only the second number carries the currency. */
const RANGE_RE = new RegExp(String.raw`${NUM}\s*(?:€|euros?)?\s*(?:y|a|-|–|hasta|ata)\s*${NUM}\s*${MULT_RE}\s*(?:de\s+)?${CUR}`, "i");

export interface AmountMention {
  cents: number;
  index: number; // position in the text
}

/** Every euro amount in a text, in order. A number only counts when "€"/"euros"/"EUR" is attached. */
export function findAmounts(text: string): AmountMention[] {
  const out: AmountMention[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const numText = (m[1] ?? m[4]).trim();
    const mult = m[2] ? MULT[m[2].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")] : 1;
    // With a multiplier, "1,5 millones" must read the comma as decimal.
    const n = mult > 1 ? Number(numText.replace(/\./g, "").replace(",", ".")) : parseSpanishNumber(numText);
    if (n === null || !Number.isFinite(n)) continue;
    out.push({ cents: eurosToCents(n * mult), index: m.index ?? 0 });
  }
  return out;
}

function toCents(numText: string, multiplier?: string): number | null {
  const mult = multiplier ? MULT[multiplier.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] : 1;
  // With a multiplier, "1,5 millones" reads the comma as decimal.
  const n = mult > 1 ? Number(numText.trim().replace(/\./g, "").replace(",", ".")) : parseSpanishNumber(numText);
  return n === null || !Number.isFinite(n) ? null : eurosToCents(n * mult);
}

/** First euro amount in a text (or a plain number = euros, e.g. BDNS presupuestoTotal), in cents. */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? eurosToCents(input) : null;
  const found = findAmounts(input);
  if (found.length) return found[0].cents;
  const bare = parseSpanishNumber(input.trim());
  return bare === null ? null : eurosToCents(bare);
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Structured amount from a sentence like the bases write it:
 * "Hasta 12.000 € por proyecto" → max; "entre 3.000 y 6.000 euros" → min+max; "desde 500 €" → min;
 * "Premio de 3.000 €" → min = max; "dotación total de 30.000 €" / "crédito de 1,5 millones de euros" → total.
 * Clauses are read independently ("Hasta 6.000 € por persona; presupuesto total 60.000 €").
 */
export function parseAmountRange(text: string | null | undefined): AmountCents {
  const res: AmountCents = {};
  if (!text) return res;
  for (const clause of text.split(/;|\n|\.\s+(?=[A-ZÁÉÍÓÚ])/)) {
    const amounts = findAmounts(clause);
    if (!amounts.length) continue;
    const f = fold(clause);
    const range = clause.match(RANGE_RE);
    const isTotal = /(total|credito|presupuesto|dotacion global|importe global|cuantia global|orzamento|consignacion)/.test(f) && !/por (proyecto|persona|beneficiari|solicitud|entidad|empresa|artista|beca|premio)/.test(f);
    if (isTotal) {
      res.totalCents ??= amounts[amounts.length - 1].cents;
      continue;
    }
    if (range) {
      const lo = toCents(range[1], range[3]);
      const hi = toCents(range[2], range[3]);
      if (lo !== null && hi !== null) {
        res.minCents ??= lo;
        res.maxCents ??= hi;
      }
    } else if (amounts.length >= 2 && /(entre|desde .* hasta)/.test(f)) {
      res.minCents ??= amounts[0].cents;
      res.maxCents ??= amounts[1].cents;
    } else if (/(hasta|maximo|max\.|como maximo|limite|tope|ata )/.test(f)) {
      res.maxCents ??= amounts[0].cents;
    } else if (/(desde|minimo|a partir de|al menos)/.test(f)) {
      res.minCents ??= amounts[0].cents;
    } else {
      res.minCents ??= amounts[0].cents;
      res.maxCents ??= amounts[0].cents;
    }
  }
  return res;
}
