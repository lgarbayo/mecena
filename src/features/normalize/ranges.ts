/**
 * Age and years-active rules. Ranges are inclusive integers. With only a birth year, a person's age on a
 * given date is one of two values; checks return "unknown" when the rule falls between them.
 */
import { parseIso } from "./dates";
import type { AgeRule, Range } from "./types";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Parse an age requirement from the bases (es/gl):
 * "entre 18 y 35 años" → {18..35}; "menores de 35 años" / "no haber cumplido 36" → {max: 34 / 35};
 * "hasta 35 años" / "35 años o menos" → {max: 35}; "mayores de edad" → {min: 18};
 * "mayores de 18 años" / "a partir de 18 años" → {min: 18} (Spanish bases use "mayor de N" as ≥ N);
 * "nacidos a partir de 1991" → {birthYearMin: 1991}; "nacidas antes de 1990" → {birthYearMax: 1989}.
 */
export function parseAgeRange(text: string | null | undefined): AgeRule {
  const r: AgeRule = {};
  if (!text) return r;
  const f = fold(text);
  let m: RegExpMatchArray | null;
  if ((m = f.match(/entre (?:los )?(\d{1,2}) (?:y|e) (?:los )?(\d{1,2}) anos/))) return { min: +m[1], max: +m[2] };
  if (/mayor(?:es)? de idade|mayor(?:es)? de edad|maior(?:es)? de idade/.test(f)) r.min = 18;
  if ((m = f.match(/(?:menor(?:es)?|menos) de (\d{1,2}) anos/))) r.max = +m[1] - 1;
  else if ((m = f.match(/no (?:haber|ter) cumplido (?:los |os )?(\d{1,2})/))) r.max = +m[1] - 1;
  else if ((m = f.match(/(?:hasta|ata|como maximo|maximo de) (?:los |os )?(\d{1,2}) anos/)) || (m = f.match(/(\d{1,2}) anos o menos/))) r.max = +m[1];
  if ((m = f.match(/(?:mayor(?:es)?|maior(?:es)?) de (\d{1,2}) anos/)) || (m = f.match(/(?:a partir de|desde|al menos|minimo de) (?:los |os )?(\d{1,2}) anos/)) || (m = f.match(/(\d{1,2}) (?:o mas )?anos o mas/)))
    r.min = +m[1];
  if ((m = f.match(/nacid[oa]s? (?:a partir del?|desde el?|despues del?|con posterioridad al?)(?: \d{1,2} de [a-z]+ de)? (\d{4})/))) r.birthYearMin = +m[1];
  if ((m = f.match(/nacid[oa]s? (?:antes del?|con anterioridad al?)(?: \d{1,2} de [a-z]+ de)? (\d{4})/))) r.birthYearMax = +m[1] - 1;
  return r;
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
