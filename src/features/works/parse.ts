/**
 * Deterministic parser for the per-work voice note (WP-02). Backs `worksAi.mock` and guards the real
 * vision call against invented facts: a field is only filled when the artist actually said it.
 *
 * "Se llama Redeira II, acuarela sobre papel de 2025, 50 por 70, de la serie Redeiras"
 *   -> { title: "Redeira II", year: 2025, technique: "acuarela sobre papel", dimensions: "50 x 70 cm", series: "Redeiras" }
 * "Nana para Lúa, 2024, cuarteto de cuerda, 6 minutos, estrenada en el Auditorio de Galicia"
 *   -> { title: "Nana para Lúa", year: 2024, technique: "cuarteto de cuerda", duration: "6 min", venue: "Auditorio de Galicia" }
 * Works of every art (CCR-arts): music, performing arts, audiovisual and literature also get
 * duration, credits (line-up, company, publisher, crew) and venue (premiere, publication, screening).
 */
import type { TechnicalSheet } from "@/contracts";

export const UNTITLED = "Sin título";

// At the same position the longest name wins ("técnica mixta" over "mixta", "cuarteto de cuerda" over "cuarteto").
const TECHNIQUES = [
  // music
  "cuarteto de cuerda",
  "trío de cuerda",
  "quinteto de viento",
  "orquesta sinfónica",
  "orquesta de cámara",
  "big band",
  "voz y guitarra",
  "voz y piano",
  "piano solo",
  "música electrónica",
  "electrónica",
  "cuarteto",
  "quinteto",
  "trío",
  "dúo",
  "orquesta",
  "coro",
  "banda",
  "canción",
  "álbum",
  "disco",
  // performing arts
  "danza contemporánea",
  "danza urbana",
  "danza",
  "flamenco",
  "ballet",
  "teatro de objetos",
  "teatro físico",
  "teatro de calle",
  "teatro",
  "circo contemporáneo",
  "circo",
  "clown",
  "títeres",
  "performance",
  // audiovisual
  "videodanza",
  "cortometraje documental",
  "cortometraje",
  "largometraje documental",
  "largometraje",
  "documental",
  "videoclip",
  "cine de animación",
  "animación",
  "videoarte",
  // literature
  "novela gráfica",
  "novela",
  "libro de poemas",
  "poemario",
  "poesía",
  "libro de relatos",
  "microrrelatos",
  "relatos",
  "relato",
  "ensayo",
  "cuento",
  "álbum ilustrado",
  // visual arts and crafts
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
// "6 minutos", "90 min", "1,5 horas", "3:45", "una hora", "hora y media", "media hora".
const DURATION_RE = /\b(?:(\d+(?:[.,]\d+)?)\s*(minutos?|mins?|horas?|segundos?)\b|(\d{1,2}:\d{2})(?!\d)|(una\s+hora\s+y\s+media|hora\s+y\s+media|media\s+hora|una\s+hora|dos\s+horas))/i;
// Where it premiered, was published or shown. "estrenada en el Auditorio de Galicia".
const VENUE_RE = /\b(?:estrenad[ao]s?|se\s+estren[óo]|presentad[ao]s?|expuest[ao]s?|proyectad[ao]s?|publicad[ao]s?|representad[ao]s?)\s+en\s+(?:el\s+|la\s+|los\s+|las\s+)?([^,.;\n]+)/i;
// Line-up / company / publisher / crew.
const CREDITS_RES = [
  /\b(?:con|por)\s+(?:la\s+)?(compa[ñn][ií]a\s+[^,.;\n]+)/i,
  /\b(editorial\s+[^,.;\n]+)/i,
  /\b(?:interpretad[ao]s?|tocad[ao]s?|bailad[ao]s?|dirigid[ao]s?|editad[ao]s?|publicad[ao]s?|producid[ao]s?|cantad[ao]s?)\s+por\s+([^,.;\n]+)/i,
  /\b(?:reparto|elenco|equipo|int[ée]rpretes|m[uú]sicos)\s*:?\s+([^,.;\n]+)/i,
];
const PAGES_RE = /\b(\d{1,4})\s*p[aá]g(?:inas|s?\.?)(?![\p{L}])/iu;
const URL_RE = /\bhttps?:\/\/[^\s,;«»"“”<>]+/gi;
const YEAR_RE = /\b(?:(?:en|de|del|año|del\s+año|hecha\s+en|pintada\s+en)\s+)?((?:19[0-9]{2})|(?:20[0-9]{2}))\b/i;

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const cap = (s: string) => (s ? s[0].toLocaleUpperCase("es-ES") + s.slice(1) : s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function parseTitle(text: string): string | undefined {
  const m = TITLE_RE.exec(text);
  const t = m && clean(m[1]);
  return t ? cap(t) : undefined;
}

const NOT_A_TITLE = /^(?:es|son|está|esta|este|estas|estos|he|hice|mide|pertenece|se|mi|mis|hay|habla|trata|quiero|tengo|un|una|lo|le|y|de|en|con|para|por)\b/i;

/** "Nana para Lúa, 2024, cuarteto de cuerda…": the opening clause is the title when the rest is facts. */
function parseLeadingTitle(text: string): string | undefined {
  const clauses = text.split(/\s*[,;]\s*/);
  if (clauses.length < 2) return undefined;
  const first = clean(clauses[0].replace(/[.:]+$/, "").replace(/^["“«']|["”»']$/g, ""));
  if (!first || !/^["“«']?\p{Lu}/u.test(clauses[0]) || first.split(/\s+/).length > 8 || NOT_A_TITLE.test(first)) return undefined;
  if (factCount(first) > 0) return undefined;
  return factCount(clauses.slice(1).join(", ")) > 0 ? first : undefined;
}

/** Strip trailing "en 2023" / "de 2024" and articles from a captured name. */
function tidyName(s: string): string {
  return clean(s.replace(/\s+(?:en|de|del|desde)\s+(?:el\s+año\s+)?(?:19|20)\d{2}\b.*$/i, "").replace(/\s+(?:y|e)\s*$/i, ""));
}

function parseVenue(text: string): string | undefined {
  const m = VENUE_RE.exec(text);
  // "en el Teatro Rosalía con la compañía Nordés": the venue ends where the people start.
  const v = m && tidyName(m[1].replace(/\s+(?:con|junto\s+a|de\s+la\s+mano\s+de|interpretad[ao]s?\s+por|dirigid[ao]s?\s+por)\s+.*$/i, ""));
  if (!v || /^(?:19|20)\d{2}$/.test(v) || /^editorial\b/i.test(v)) return undefined;
  return cap(v);
}

function parseCredits(text: string): string | undefined {
  for (const re of CREDITS_RES) {
    const m = re.exec(text);
    const c = m && tidyName(m[1]);
    if (c && !/^(?:19|20)\d{2}$/.test(c)) return cap(c);
  }
  return undefined;
}

function parseDuration(text: string): string | undefined {
  const m = DURATION_RE.exec(text);
  if (!m) return undefined;
  if (m[3]) return m[3];
  if (m[4]) {
    const w = m[4].toLowerCase().replace(/\s+/g, " ");
    return w.includes("y media") ? "90 min" : w === "media hora" ? "30 min" : w === "dos horas" ? "2 h" : "1 h";
  }
  const n = m[1].replace(".", ",");
  const u = m[2].toLowerCase();
  return `${n} ${u.startsWith("h") ? "h" : u.startsWith("s") ? "s" : "min"}`;
}

function parsePages(text: string): string | undefined {
  const m = PAGES_RE.exec(text);
  return m ? `${m[1]} páginas` : undefined;
}

/** Links typed into the note (speech never produces them, typing can). */
export function extractLinks(text: string | undefined): string[] {
  const out = new Set<string>();
  for (const m of (text ?? "").matchAll(URL_RE)) {
    const u = m[0].replace(/[.)\]]+$/, "");
    try {
      out.add(new URL(u).toString());
    } catch {
      /* not a URL */
    }
  }
  return [...out];
}

/** How many factual bits a piece of text carries (used to tell facts from the artist's own words). */
function factCount(s: string): number {
  return [YEAR_RE.test(s) && /\b(?:19|20)\d{2}\b/.test(s), parseTechnique(s), DIMENSIONS_RE.test(s), DURATION_RE.test(s), VENUE_RE.test(s), parseCredits(s), PAGES_RE.test(s)].filter(Boolean).length;
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

/** Venue and credits clauses name places and people ("Teatro Rosalía", "Editorial Galaxia"): not techniques. */
function withoutNames(text: string): string {
  let t = text.replace(URL_RE, " ");
  for (const re of [VENUE_RE, ...CREDITS_RES]) t = t.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"), " ");
  return t;
}

function parseTechnique(text: string): string | undefined {
  const lower = withoutNames(text).toLocaleLowerCase("es-ES");
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
  const factual = (s: string) => {
    const facts = factCount(s);
    return (
      TITLE_RE.test(s) ||
      SERIES_RE.test(s) ||
      DIMENSIONS_RE.test(s) ||
      parseLeadingTitle(s) !== undefined ||
      facts >= 2 ||
      (facts >= 1 && s.split(/\s+/).length <= 8) ||
      /^\W*(?:de|en)\s+\d{4}\W*$/i.test(s) ||
      /^\W*https?:\/\//i.test(s)
    );
  };
  const kept = sentences.filter((s) => !factual(s) && s.split(/\s+/).length >= 3);
  if (!kept.length) return undefined;
  const joined = kept.join(" ");
  return cap(/[.!?]$/.test(joined) ? joined : `${joined}.`);
}

/** Facts explicitly stated in the voice note. Missing fields stay undefined (never invented). */
export function parseVoiceSheet(voice: string | undefined): Partial<TechnicalSheet> {
  const text = clean((voice ?? "").replace(URL_RE, " "));
  if (!text) return {};
  const out: Partial<TechnicalSheet> = {
    title: parseTitle(text) ?? parseLeadingTitle(text),
    year: parseYear(text),
    technique: parseTechnique(text),
    dimensions: parseDimensions(text) ?? parsePages(text),
    duration: parseDuration(text),
    credits: parseCredits(text),
    venue: parseVenue(text),
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

/** True when the note talks about how long the piece lasts. */
export function mentionsDuration(voice: string | undefined): boolean {
  return !!voice && (DURATION_RE.test(voice) || /\b(?:dura|duración|minutos?|horas?)\b/i.test(voice));
}

/** True when the note mentions any number that could be a measure ("50 por 70", "mide 1 metro"). */
export function mentionsDimensions(voice: string | undefined): boolean {
  if (!voice) return false;
  return DIMENSIONS_RE.test(voice) || /\b(?:mide|medidas?|cent[ií]metros|cm|metros?)\b/i.test(voice);
}
