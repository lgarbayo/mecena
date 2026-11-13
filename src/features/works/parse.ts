/**
 * Deterministic parser for the per-work voice note (WP-02). Backs `worksAi.mock` and guards the real
 * vision call against invented facts: a field is only filled when the artist actually said it.
 *
 * "Se llama Redeira II, acuarela sobre papel de 2025, 50 por 70, de la serie Redeiras"
 *   -> { title: "Redeira II", year: 2025, technique: "acuarela sobre papel", dimensions: "50 x 70 cm", series: "Redeiras" }
 */
import type { TechnicalSheet } from "@/contracts";
import { polishProse } from "@/server/ai/wording";

export const UNTITLED = "Sin título";

// Longer names first so "técnica mixta" wins over "mixta", "linograbado" over "grabado"…
const TECHNIQUES = [
  "técnica mixta",
  "tinta china",
  "lápiz de color",
  "pintura digital",
  "ilustración digital",
  "fotografía analógica",
  "fotografía digital",
  "linograbado",
  "xilografía",
  "serigrafía",
  "aguafuerte",
  "litografía",
  "grabado",
  "acuarela",
  "gouache",
  "guache",
  "acrílico",
  "óleo",
  "temple",
  "tinta",
  "carboncillo",
  "grafito",
  "lápiz",
  "pastel",
  "collage",
  "fotografía",
  "cerámica",
  "escultura",
  "bronce",
  "talla en madera",
  "bordado",
  "textil",
  "cianotipia",
  "digital",
];

const SUPPORTS = ["papel", "lienzo", "tabla", "madera", "tela", "cartón", "cartulina", "lino", "metal", "cobre", "vidrio", "algodón", "seda", "pared"];

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const BY = String.raw`\s*(?:x|×|por)\s*`;
const UNIT = String.raw`(cm|centímetros|centimetros|mm|milímetros|milimetros|m|metros)\b`;
const DIMENSIONS_RE = new RegExp(String.raw`\b(${NUM})${BY}(${NUM})(?:${BY}(${NUM}))?(?:\s*${UNIT})?`, "i");

const TITLE_RE = /\b(?:se\s+llama|se\s+titula|(?:la|lo)\s+(?:he\s+)?(?:llamo|llamé|titulé|titulo|he\s+llamado|he\s+titulado)|(?:el\s+)?t[ií]tulo\s+(?:es|será)|t[ií]tulo:)\s+["“«']?([^,.;:"”»\n]+?)["”»']?(?=\s*(?:[,.;:\n]|$|\s+y\s+(?:es|está|mide|la\s+hice|lo\s+hice|forma|pertenece)\b))/i;
const SERIES_RE = /\bserie\s+(?:titulada\s+|llamada\s+|de\s+nombre\s+)?["“«']?([^,.;:"”»\n]+?)["”»']?(?=\s*(?:[,.;:\n]|$|\s+y\s+))/i;
const YEAR_RE = /\b(?:(?:en|de|del|año|del\s+año|hecha\s+en|pintada\s+en)\s+)?((?:19[0-9]{2})|(?:20[0-9]{2}))\b/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cap = (s: string) => (s ? s[0].toLocaleUpperCase("es-ES") + s.slice(1) : s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseTitle(text: string): string | undefined {
  const m = TITLE_RE.exec(text);
  const t = m && clean(m[1]);
  return t ? cap(t) : undefined;
}

function parseSeries(text: string): string | undefined {
  const m = SERIES_RE.exec(text);
  const s = m && clean(m[1].replace(/^(?:de\s+)?(?:la|las|los|el)\s+(?=[A-ZÁÉÍÓÚÑ])/, ""));
  return s ? cap(s) : undefined;
}

function parseYear(text: string, now = new Date()): number | undefined {
  // Skip numbers that are part of measures ("2000 x 1500 mm").
  const withoutDims = text.replace(new RegExp(DIMENSIONS_RE.source, "gi"), " ");
  const m = YEAR_RE.exec(withoutDims);
  if (!m) return undefined;
  const y = Number(m[1]);
  return y >= 1900 && y <= now.getFullYear() + 1 ? y : undefined;
}

function parseTechnique(text: string): string | undefined {
  const lower = text.toLocaleLowerCase("es-ES");
  const supports = SUPPORTS.map(escapeRe).join("|");
  // Earliest mention wins ("tinta y acuarela" -> tinta first); at the same spot, the longest name.
  let best: RegExpExecArray | undefined;
  for (const t of TECHNIQUES) {
    const m = new RegExp(String.raw`(?:^|[^\p{L}])(${escapeRe(t)})(?![\p{L}])((?:\s+(?:y|e)\s+[\p{L}]+)?)(\s+sobre\s+(${supports}))?`, "iu").exec(lower);
    if (m && (!best || m.index < best.index)) best = m;
  }
  if (!best) return undefined;
  let out = best[1];
  // "tinta y acuarela" -> keep the pair when the second word is also a technique.
  const second = best[2]?.trim().split(/\s+/).pop();
  if (second && TECHNIQUES.includes(second)) out += ` y ${second}`;
  if (best[4]) out += ` sobre ${best[4]}`;
  else if (second && TECHNIQUES.includes(second)) {
    const s = new RegExp(String.raw`${escapeRe(second)}\s+sobre\s+(${supports})`, "iu").exec(lower);
    if (s) out += ` sobre ${s[1]}`;
  }
  return out;
}

function normUnit(u: string | undefined): string {
  const x = (u ?? "cm").toLowerCase();
  if (x.startsWith("mm") || x.startsWith("mil")) return "mm";
  if (x === "m" || x.startsWith("metro")) return "m";
  return "cm";
}

function parseDimensions(text: string): string | undefined {
  const m = DIMENSIONS_RE.exec(text);
  if (!m) return undefined;
  const nums = [m[1], m[2], m[3]].filter(Boolean).map((n) => n.replace(".", ","));
  return `${nums.join(" x ")} ${normUnit(m[4])}`;
}

/** What is left once the factual bits are removed: the artist's own words about the piece. */
function parseConcept(text: string): string | undefined {
  const sentences = text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map(clean)
    .filter(Boolean);
  const factual = (s: string) =>
    TITLE_RE.test(s) || SERIES_RE.test(s) || DIMENSIONS_RE.test(s) || (parseTechnique(s) !== undefined && s.split(/\s+/).length <= 8) || /^\W*(?:de|en)\s+\d{4}\W*$/i.test(s);
  const kept = sentences.filter((s) => !factual(s) && s.split(/\s+/).length >= 3);
  if (!kept.length) return undefined;
  const joined = kept.join(" ");
  // The no-AI path writes this into the sheet: their words, with the unambiguous typos fixed.
  return cap(polishProse(/[.!?]$/.test(joined) ? joined : `${joined}.`));
}

/** Facts explicitly stated in the voice note. Missing fields stay undefined (never invented). */
export function parseVoiceSheet(voice: string | undefined): Partial<TechnicalSheet> {
  const text = clean(voice ?? "");
  if (!text) return {};
  const out: Partial<TechnicalSheet> = {
    title: parseTitle(text),
    year: parseYear(text),
    technique: parseTechnique(text),
    dimensions: parseDimensions(text),
    series: parseSeries(text),
    concept: parseConcept(text),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== "")) as Partial<TechnicalSheet>;
}

/** Full sheet from the voice note only (mock path). */
export function sheetFromVoice(voice: string | undefined): TechnicalSheet {
  const p = parseVoiceSheet(voice);
  return { ...p, title: p.title ?? UNTITLED };
}

/** True when the note mentions any number that could be a measure ("50 por 70", "mide 1 metro"). */
export function mentionsDimensions(voice: string | undefined): boolean {
  if (!voice) return false;
  return DIMENSIONS_RE.test(voice) || /\b(?:mide|medidas?|cent[ií]metros|cm|metros?)\b/i.test(voice);
}
