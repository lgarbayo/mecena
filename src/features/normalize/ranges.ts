/**
 * Age and years-active rules. Ranges are inclusive integers. With only a birth year, a person's age on a
 * given date is one of two values; checks return "unknown" when the rule falls between them.
 */
import { parseIso } from "./dates";
import type { AgeRule, Range } from "./types";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "N años" that measure something other than age ("5 años de actividad", "2 años seguidos de alta"). */
const NOT_AGE = String.raw`(?! (?:seguidos |continuados |ininterrumpidos )?(?:de |en )?(?:actividad|trayectoria|antiguedad|experiencia|alta|residencia|empadronamiento|ejercicio|existencia|vida|funcionamiento|carrera))`;
/** Words that make a bare "a partir de / desde / al menos N años" an age rule. */
const AGE_CONTEXT = /\b(edad|idade|cumplid\w*|cumprid\w*|nacid\w*|nacement\w*|mayor(?:es)?|maior(?:es)?|menor(?:es)?|xoves|jovenes|joven)\b/;

/**
 * Parse an age requirement from the bases (es/gl):
 * "entre 18 y 35 años" → {18..35}; "menores de 35 años" / "no haber cumplido 36" → {max: 34 / 35};
 * "hasta 35 años" / "35 años o menos" → {max: 35}; "mayores de edad" → {min: 18};
 * "mayores de 18 años" / "a partir de 18 años de edad" → {min: 18} (Spanish bases use "mayor de N" as ≥ N);
 * "nacidos a partir de 1991" → {birthYearMin: 1991}; "nacidas antes de 1990" → {birthYearMax: 1989}.
 * Read sentence by sentence: "N años" of activity, trajectory or residence is not an age, and a bare
 * "al menos N años" needs an age word (edad, cumplidos, nacidos, mayor, menor…) in the same sentence.
 */
export function parseAgeRange(text: string | null | undefined): AgeRule {
  const r: AgeRule = {};
  if (!text) return r;
  for (const sentence of fold(text).split(/(?<=[.;])\s+|\n+/)) {
    const part = parseAgeSentence(sentence);
    for (const k of ["min", "max", "birthYearMin", "birthYearMax"] as const) if (r[k] === undefined && part[k] !== undefined) r[k] = part[k];
  }
  return r;
}

function parseAgeSentence(f: string): AgeRule {
  const r: AgeRule = {};
  const anos = `anos${NOT_AGE}`;
  let m: RegExpMatchArray | null;
  if ((m = f.match(new RegExp(`entre (?:los )?(\\d{1,2}) (?:y|e) (?:los )?(\\d{1,2}) ${anos}`)))) return { min: +m[1], max: +m[2] };
  if (/mayor(?:es)? de idade|mayor(?:es)? de edad|maior(?:es)? de idade/.test(f)) r.min = 18;
  if ((m = f.match(new RegExp(`(?:menor(?:es)?|menos) de (\\d{1,2}) ${anos}`)))) r.max = +m[1] - 1;
  else if ((m = f.match(/no (?:haber|ter) cumplido (?:los |os )?(\d{1,2})/))) r.max = +m[1] - 1;
  else if ((m = f.match(new RegExp(`(?:hasta|ata|como maximo|maximo de) (?:los |os )?(\\d{1,2}) ${anos}`))) || (m = f.match(/(\d{1,2}) anos o menos/))) r.max = +m[1];
  if (
    (m = f.match(new RegExp(`(?:mayor(?:es)?|maior(?:es)?) de (\\d{1,2}) ${anos}`))) ||
    (AGE_CONTEXT.test(f) && (m = f.match(new RegExp(`(?:a partir de|desde|al menos|minimo de) (?:los |os )?(\\d{1,2}) ${anos}`)))) ||
    (m = f.match(new RegExp(`(\\d{1,2}) (?:o mas )?anos o mas${NOT_AGE}`)))
  )
    r.min = +m[1];
  if ((m = f.match(/nacid[oa]s? (?:a partir del?|desde el?|despues del?|con posterioridad al?)(?: \d{1,2} de [a-z]+ de)? (\d{4})/))) r.birthYearMin = +m[1];
  if ((m = f.match(/nacid[oa]s? (?:antes del?|con anterioridad al?)(?: \d{1,2} de [a-z]+ de)? (\d{4})/))) r.birthYearMax = +m[1] - 1;
  return r;
}

/**
 * Minimum staff from the bases: "mínimo 3 personas trabajadoras", "al menos 2 trabajadores", "plantilla mínima de 5
 * empleados", "un mínimo de 3 persoas traballadoras". Undefined when the text sets none.
 */
export function parseMinEmployees(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const f = fold(text);
  const staff = String.raw`(?:personas? (?:trabajadoras?|empleadas?|asalariadas?)|persoas? traballadoras?|trabajador(?:es|as)?|traballador(?:es|as)?|emplead[oa]s?|asalariad[oa]s?)`;
  const m =
    f.match(new RegExp(String.raw`(?:un )?(?:minimo de|minimo|al menos|como minimo|polo menos) (\d{1,3}) ${staff}`)) ??
    f.match(new RegExp(String.raw`plantilla minima de (\d{1,3})`)) ??
    f.match(new RegExp(String.raw`(\d{1,3}) o mas ${staff}`));
  return m ? +m[1] : undefined;
}

/**
 * Minimum yearly turnover from the bases: "facturación mínima de 100.000 €", "facturación anual de al menos 12.000 €",
 * "facturación superior a 50.000 euros". Undefined when the text sets none. A ceiling ("facturación inferior a…") or a
 * different figure (net income, grant amount) is not a minimum turnover.
 */
export function parseMinRevenue(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const f = fold(text);
  const amount = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?`;
  const m =
    f.match(new RegExp(String.raw`factur\w* (?:anual |bruta |neta )?(?:minim[oa] |anual minim[oa] )(?:de |anual de )?${amount}`)) ??
    f.match(new RegExp(String.raw`factur\w* (?:anual |bruta |neta )?(?:de )?(?:al menos|superior a|igual o superior a|no inferior a|mayor (?:de|que)) ${amount}`)) ??
    f.match(new RegExp(String.raw`volumen de negocio (?:minim[oa] )?(?:de )?(?:al menos|superior a|minim[oa] de) ${amount}`));
  return m ? Number(m[1].replace(/\./g, "")) : undefined;
}

/** Possible ages on `atIso` for someone born in `birthYear` (birthday before or after that date). */
export function ageRangeAt(birthYear: number, atIso: string): Range {
  const y = parseIso(atIso).getUTCFullYear();
  return { min: y - birthYear - 1, max: y - birthYear };
}

export type CheckResult = "pass" | "fail" | "unknown";

/** Age eligibility on a reference date (normally the call deadline). Missing birth year → unknown. */
export function ageCheck(birthYear: number | undefined, rule: AgeRule, atIso: string): CheckResult {
  const hasRule = rule.min !== undefined || rule.max !== undefined || rule.birthYearMin !== undefined || rule.birthYearMax !== undefined;
  if (!hasRule) return "pass";
  if (birthYear === undefined) return "unknown";
  if (rule.birthYearMin !== undefined && birthYear < rule.birthYearMin) return "fail";
  if (rule.birthYearMax !== undefined && birthYear > rule.birthYearMax) return "fail";
  const age = ageRangeAt(birthYear, atIso);
  const lo = rule.min ?? -Infinity;
  const hi = rule.max ?? Infinity;
  if (age.min! >= lo && age.max! <= hi) return "pass";
  if (age.max! < lo || age.min! > hi) return "fail";
  return "unknown"; // the birthday decides
}

/**
 * Years-active requirement ("al menos 2 años de actividad", "empresas constituidas en los últimos 3 años",
 * "antigüedad máxima de 5 años", "entre 1 y 5 años de trayectoria").
 */
export function parseYearsActive(text: string | null | undefined): Range {
  const r: Range = {};
  if (!text) return r;
  const f = fold(text);
  let m: RegExpMatchArray | null;
  if ((m = f.match(/entre (\d{1,2}) y (\d{1,2}) anos de (?:actividad|trayectoria|antiguedad|experiencia)/))) return { min: +m[1], max: +m[2] };
  if ((m = f.match(/(?:al menos|como minimo|minimo de|mas de|polo menos) (\d{1,2}) anos de (?:actividad|trayectoria|antiguedad|experiencia|alta)/))) r.min = +m[1];
  if ((m = f.match(/(?:ultimos|menos de|antiguedad maxima de|maximo de|no mas de) (\d{1,2}) anos/)) && /(constituid|creacion|antiguedad|actividad|alta|inicio)/.test(f)) r.max = +m[1];
  return r;
}

/** Years active from a founding/start year, checked like ages (year precision → may be unknown). */
export function yearsActiveCheck(foundedYear: number | undefined, rule: Range, atIso: string): CheckResult {
  if (rule.min === undefined && rule.max === undefined) return "pass";
  if (foundedYear === undefined) return "unknown";
  return ageCheck(foundedYear, rule, atIso);
}
