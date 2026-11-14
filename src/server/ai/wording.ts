/**
 * Lexical clean-up of the person's own words (spoken or typed) wherever we WRITE them into the dossier, the profile
 * or an application. The transcript itself is never touched: it is the provenance record of what was actually said.
 * We correct the form (typos, spelling, accents, capitals, punctuation, speech-to-text slips, chat shorthand) and
 * never the substance (same words, same register, same facts).
 *
 * Two layers:
 * - WORDING_RULE: the instruction every prompt that writes from the user's words carries. Claude does the real fix:
 *   it has the context to tell "echo" from "hecho" or Galician "ano" from a Spanish "año" without ñ. Its output is
 *   NOT post-processed here (a context-free rule would undo what it got right).
 * - fixWording / polishProse: a conservative deterministic floor for the no-AI paths only (mock, per-turn fallback,
 *   offline import). It fixes what is unambiguous out of context in Spanish AND Galician; anything doubtful stays.
 */

/** Prompt rule (Spanish): correct the form, never the substance. */
export const WORDING_RULE = [
  "Corrige la forma, nunca el fondo: todo lo que escribas a partir de sus palabras (dichas o escritas) sale sin erratas.",
  "- Corrige faltas de ortografía, tildes, letras cambiadas o que faltan, mayúsculas, puntuación, palabras repetidas sin querer y abreviaturas de chat (q, xq, tb).",
  "- Corrige los fallos del dictado por voz: si una palabra suena parecido pero no encaja («haber» por «a ver», «echo» por «hecho», «hay» por «ahí», una palabra partida o pegada), escribe la que quiso decir cuando el contexto lo deja claro.",
  "- No cambies su vocabulario, su registro ni el sentido, y no añadas ni quites datos. Si dudas de qué quiso decir, deja la palabra como está.",
  "- Nombres propios (personas, lugares, obras, series, galerías, marcas) y enlaces: respeta su grafía; como mucho corrige mayúsculas de nombres.",
  "- Lo que diga en gallego se escribe en gallego (sin traducirlo ni mezclar idiomas en la misma frase), corregido según la norma gallega.",
].join("\n");

/**
 * Mojibake / wrong-script output ("ÂżDĂłnde vives?", seen from Sonnet in the voice spike): characters Spanish and
 * Galician never use (Ã Â Ă Ĺ, Arabic script, U+FFFD). Use it to drop a generated line and fall back to ours.
 */
const GARBLED = /[ÃÂĂĹ\u0600-\u06FF\uFFFD]/;
export function looksGarbled(text: string): boolean {
  return GARBLED.test(text);
}

const L = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ";
const B = `(?<![${L}\\d_])`; // word start (Unicode-aware, unlike \b)
const E = `(?![${L}\\d_])`; // word end

/**
 * Words that are never correct without their accent: no homograph in Spanish or Galician, and no verb form
 * ("ultima" from ultimar, "pais" = Galician parents, "ano" = Galician year are deliberately absent).
 */
const ACCENTED: Record<string, string> = {
  tambien: "también",
  ademas: "además",
  despues: "después",
  aqui: "aquí",
  alli: "allí",
  asi: "así",
  todavia: "todavía",
  jamas: "jamás",
  quizas: "quizás",
  dias: "días",
  paises: "países",
  fotografia: "fotografía",
  fotografias: "fotografías",
  biografia: "biografía",
  galeria: "galería",
  galerias: "galerías",
  poesia: "poesía",
  tecnologia: "tecnología",
  ceramica: "cerámica",
  ceramicas: "cerámicas",
  musica: "música",
  musicas: "músicas",
  tecnica: "técnica",
  tecnicas: "técnicas",
  estetica: "estética",
  artistico: "artístico",
  artistica: "artística",
  artisticos: "artísticos",
  artisticas: "artísticas",
  oleo: "óleo",
  oleos: "óleos",
  ultimos: "últimos",
  unicos: "únicos",
  unicas: "únicas",
  proximos: "próximos",
  proximas: "próximas",
  facil: "fácil",
  dificil: "difícil",
  frances: "francés",
  aleman: "alemán",
  portugues: "portugués",
};

/** Chat shorthand with a single reading. Lowercase only ("2 TB", "Q&A" and initials are left alone). */
const SHORTHAND: Record<string, string> = { q: "que", xq: "porque", pq: "porque", porq: "porque", tb: "también", tmb: "también", tbn: "también" };

/**
 * Function words that a dictation stutter or a double tap repeats ("de de", "el el"). Case-sensitive; without
 * "a" ("me mudé a A Coruña"), "para" ("no para para nada"), "es" ("lo que es es…") and "que" (often "que qué").
 */
const STUTTER = "el|la|los|las|de|del|en|y|un|una|con|por|mi|mis|me|se|lo|le|al|su|sus|porque|también";

/** Never touched: links, bare domains, emails, handles, hashtags, snake_case tokens. Linear-time patterns only. */
const PROTECTED = new RegExp(
  [
    "https?:\\/\\/\\S+",
    "www\\.\\S+",
    "(?<!\\S)[^\\s@]+@[^\\s@]+\\.\\S+",
    "@[A-Za-z0-9_.]{2,}",
    "#[\\p{L}\\p{N}_]+",
    "(?<![\\p{L}\\p{N}.-])[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:com|net|org|es|gal|eus|cat|eu|art|io|me|info|studio|xyz|co|pt|fr|it|de|uk)(?![\\p{L}\\p{N}])(?:\\/\\S*)?",
    "[\\p{L}\\p{N}]*_[\\p{L}\\p{N}_]*",
  ].join("|"),
  "gu",
);

/** Keep the case pattern of the original word: "Tambien" → "También", "TAMBIEN" → "TAMBIÉN". */
function matchCase(original: string, fixed: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return fixed.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return fixed.charAt(0).toUpperCase() + fixed.slice(1);
  return fixed;
}

/**
 * A capitalised word is probably a proper name ("Galeria Joan Prats", "Fundacion Barrié" is fine but
 * "Interaccion Studio" is a title): only fix it when it is lowercase, or at a real sentence/line start and not
 * followed by another capitalised word.
 */
function isFreeWord(word: string, offset: number, whole: string): boolean {
  if (word === word.toLowerCase()) return true;
  const atStart = /(^|[.!?]\s+|\n[ \t]*(-[ \t]+)?)$/.test(whole.slice(0, offset));
  const nameFollows = new RegExp(`^[ \\t]+[A-ZÁÉÍÓÚÜÑ]`).test(whole.slice(offset + word.length));
  return atStart && !nameFollows;
}

function fixPlain(text: string): string {
  let t = text;
  // Spacing inside a line (never across line breaks, never the indentation at a line start).
  t = t.replace(/(\S)[ \t]{2,}/g, "$1 ");
  t = t.replace(/(\S)[ \t]+([,;!?»”…]|\.(?!\.))/g, "$1$2");
  t = t.replace(new RegExp(`([${L}]),(?=[${L}])`, "g"), "$1, ");
  // Chat shorthand: lowercase, not right after a number ("2 tb"), followed by another word.
  t = t.replace(new RegExp(`(?<!\\d[ \\t]?)${B}(${Object.keys(SHORTHAND).join("|")})(?=[ \\t]+[${L}])`, "g"), (m) => SHORTHAND[m]);
  // Stutters / double taps on function words (after the shorthand, so "q que" style repeats are caught too).
  t = t.replace(new RegExp(`${B}(${STUTTER})([ \\t]+\\1)+${E}`, "g"), "$1");
  // "-cion" singular nouns always carry the accent in Spanish and Galician (acción, exposición, ilustración).
  t = t.replace(new RegExp(`${B}([${L}]{2,})(cion)${E}`, "gi"), (m: string, stem: string, end: string, offset: number, whole: string) =>
    isFreeWord(m, offset, whole) ? stem + (end === "CION" ? "CIÓN" : "ción") : m,
  );
  // Unambiguous accent dictionary.
  t = t.replace(new RegExp(`${B}(${Object.keys(ACCENTED).join("|")})${E}`, "gi"), (m: string, _w: string, offset: number, whole: string) =>
    isFreeWord(m, offset, whole) ? matchCase(m, ACCENTED[m.toLowerCase()]) : m,
  );
  return t;
}

/** Split into [plain, protected, plain, …]: odd indexes are protected tokens. */
function splitProtected(text: string): string[] {
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(PROTECTED)) {
    parts.push(text.slice(last, m.index), m[0]);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

/** Word-level, case-preserving fixes. Safe on any fragment (clauses, list items, whole sections). Idempotent. */
export function fixWording(text: string): string {
  if (!text) return text;
  return splitProtected(text)
    .map((p, i) => (i % 2 ? p : fixPlain(p)))
    .join("");
}

/** Abbreviations after which a period does not end the sentence. */
const ABBREVIATIONS =
  /(?:^|[\s.(])(?:etc|ej|pág|págs|aprox|nº|núm|sr|sra|sres|dr|dra|vol|cap|art|av|avda|pza|plza|pl|univ|esc|ed|eds|trad|coord|ctra|tel|tlf|coop|ud|uds|min|seg|aux|dept|depto|prof|profa)\.$/i;
const INITIAL_OR_ACRONYM = new RegExp(`(?:^|[^${L}])(?:[${L}]\\.)+$`);

/**
 * Prose: fixWording + a capital at the start of the text and of every sentence (after . ! ?), except after
 * abbreviations, initials and dotted acronyms ("p. ej. una", "María J. de Castro", "una S.L. y"), after an
 * ellipsis (the case there is the person's call), and never on a link or handle.
 */
export function polishProse(text: string): string {
  const t = fixWording(text.trim());
  if (!t) return t;
  const parts = splitProtected(t);
  const upperAt = (s: string, idx: number) => s.slice(0, idx) + s.charAt(idx).toUpperCase() + s.slice(idx + 1);
  // Start of the text, unless it begins with a protected token.
  const head = new RegExp(`^[¿¡"“«'(\\-\\s]*`).exec(parts[0])![0].length;
  if (head < parts[0].length && new RegExp(`[${L}]`).test(parts[0].charAt(head))) parts[0] = upperAt(parts[0], head);
  return parts
    .map((p, i, all) => {
      if (i % 2) return p;
      const before = all.slice(0, i).join("");
      return p.replace(new RegExp(`([.!?])([ \\t]+)([¿¡"“«]?)([a-záéíóúüñ])`, "g"), (m, punct: string, sp: string, open: string, c: string, offset: number) => {
        const upto = before + p.slice(0, offset + 1);
        if (punct === "." && (upto.endsWith("..") || ABBREVIATIONS.test(upto) || INITIAL_OR_ACRONYM.test(upto))) return m;
        return punct + sp + open + c.toUpperCase();
      });
    })
    .join("");
}
