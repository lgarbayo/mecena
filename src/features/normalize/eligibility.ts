/**
 * Hard eligibility on canonical data (DATA-PIPELINE §4 Phase A). Pure code, explainable, no AI.
 * "unknown" never discards a call: it becomes a "Confírmalo: …" item in qué te falta.
 * WP-06 can call this directly from ruleMatch or reuse the per-dimension checks.
 */
import { beneficiaryCheck, beneficiaryLabel } from "./beneficiary";
import { cnaeCheck, cnaeLabel } from "./cnae";
import { ageCheck, type CheckResult } from "./ranges";
import { territoryCheck, territoryName } from "./territory";
import type { CanonicalCall, CanonicalProfile } from "./types";

export interface EligibilityCheck {
  rule: "beneficiary" | "territory" | "age" | "deadline" | "sector" | "employees";
  result: CheckResult;
  reason: string; // Spanish, user-facing
}

export interface EligibilityResult {
  eligible: boolean; // no check failed
  needsConfirmation: boolean; // some check is unknown
  checks: EligibilityCheck[];
}

/** "18–35 años", "hasta 35 años", "18 o más años", "nacidos desde 1991". */
export function describeAge(age: CanonicalCall["age"]): string {
  const parts: string[] = [];
  if (age.min !== undefined && age.max !== undefined) parts.push(`${age.min}–${age.max} años`);
  else if (age.max !== undefined) parts.push(`hasta ${age.max} años`);
  else if (age.min !== undefined) parts.push(`${age.min} o más años`);
  if (age.birthYearMin !== undefined) parts.push(`nacidos desde ${age.birthYearMin}`);
  if (age.birthYearMax !== undefined) parts.push(`nacidos hasta ${age.birthYearMax}`);
  return parts.join(", ");
}

export function evaluateEligibility(profile: CanonicalProfile, call: CanonicalCall, opts: { today: string }): EligibilityResult {
  const checks: EligibilityCheck[] = [];

  // Beneficiary type
  const b = beneficiaryCheck(profile.beneficiaryTypes, call.beneficiaryTypes);
  const callTypes = call.beneficiaryTypes.map((t) => beneficiaryLabel(t).toLowerCase()).join(", ");
  checks.push({
    rule: "beneficiary",
    result: b,
    reason:
      b === "pass"
        ? `Puedes presentarte como ${beneficiaryLabel(profile.beneficiaryTypes.find((t) => call.beneficiaryTypes.includes(t))!).toLowerCase()}`
        : b === "fail"
          ? `Es solo para: ${callTypes}`
          : profile.beneficiaryTypes.length && call.beneficiaryTypes.length
            ? `Confírmalo: es para ${callTypes}; revisa si las bases admiten autónomos`
            : "Confírmalo: no sabemos si tu forma jurídica encaja",
  });

  // Territory. "Ámbito estatal" only when the call really is state-wide: stored ES/WORLD territories or an estatal
  // scope. A local or regional call that stores no residence rule is not assumed open to all Spain: confirm it.
  checks.push(territoryEligibility(profile, call));

  // Deadline (closed calls are out; rolling/unknown dates are not discarded)
  const d = call.deadline.date;
  const dl: CheckResult = !d ? (call.deadline.method === "rolling" ? "pass" : "unknown") : d >= opts.today ? "pass" : "fail";
  checks.push({
    rule: "deadline",
    result: dl,
    reason:
      dl === "pass"
        ? d
          ? `Plazo abierto hasta el ${d}${call.deadline.estimated ? " (estimado)" : ""}`
          : "Sin plazo cerrado"
        : dl === "fail"
          ? `El plazo terminó el ${d}`
          : "Confírmalo: no consta la fecha límite",
  });

  // Age at the deadline (or today)
  const a = ageCheck(profile.birthYear, call.age, d ?? opts.today);
  if (call.age.min !== undefined || call.age.max !== undefined || call.age.birthYearMin !== undefined || call.age.birthYearMax !== undefined) {
    const range = describeAge(call.age);
    checks.push({
      rule: "age",
      result: a,
      reason: a === "pass" ? `Cumples la edad (${range})` : a === "fail" ? `Edad fuera del rango (${range})` : `Confírmalo: edad exigida ${range}`,
    });
  }

  // Sector (only meaningful for business profiles)
  if (call.sectors.length && profile.kind === "business") {
    const s = cnaeCheck(profile.cnae, call.sectors);
    checks.push({
      rule: "sector",
      result: s,
      reason: s === "pass" ? "Tu actividad está entre los sectores de la convocatoria" : s === "fail" ? `Sectores: ${call.sectors.map(cnaeLabel).join(", ")}` : "Confírmalo: indica tu CNAE",
    });
  }

  if ((call.maxEmployees !== undefined || call.minEmployees !== undefined) && profile.kind === "business") {
    const { minEmployees: lo, maxEmployees: hi } = call;
    const rule = lo !== undefined && hi !== undefined ? `entre ${lo} y ${hi} empleados` : lo !== undefined ? `mínimo ${lo} ${lo === 1 ? "persona trabajadora" : "personas trabajadoras"}` : `máximo ${hi} empleados`;
    const n = profile.employees;
    const e: CheckResult = n === undefined ? "unknown" : (lo === undefined || n >= lo) && (hi === undefined || n <= hi) ? "pass" : "fail";
    const ucfirst = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    checks.push({
      rule: "employees",
      result: e,
      reason:
        e === "unknown"
          ? `Confírmalo: ${rule}`
          : e === "pass"
            ? `Cumples el tamaño de plantilla (${rule})`
            : `${ucfirst(rule)}: tienes ${n} ${n === 1 ? "persona" : "personas"} en plantilla`,
    });
  }

  return {
    eligible: checks.every((c) => c.result !== "fail"),
    needsConfirmation: checks.some((c) => c.result === "unknown"),
    checks,
  };
}

const SCOPE_LABEL: Record<string, string> = { local: "municipal", provincial: "provincial", autonomico: "autonómica", privado: "privada", europeo: "europea", estatal: "estatal" };

/** Territory rule with honest wording about who can apply (residence), never confusing it with the organiser's area. */
function territoryEligibility(profile: CanonicalProfile, call: CanonicalCall): EligibilityCheck {
  const wide = call.territories.every((x) => x === "ES" || x === "WORLD");
  if (wide && call.territoryImplicit && call.scope !== "estatal" && call.scope !== "europeo") {
    const where = call.region ? `de ${call.region}` : "";
    return {
      rule: "territory",
      result: "unknown",
      reason: `Confírmalo: ámbito ${[SCOPE_LABEL[call.scope ?? ""] ?? "", where].filter(Boolean).join(" ") || "sin especificar"}; revisa en las bases si exige vivir allí`,
    };
  }
  const t = territoryCheck(profile.territory, call.territories);
  const place = call.territories.map(territoryName).join(" o ");
  let reason: string;
  if (t === "pass") {
    if (call.territories.includes("WORLD")) reason = "Abierta a cualquier persona, vivas donde vivas";
    else if (wide)
      reason =
        call.scope === "estatal" || call.scope === "europeo"
          ? "Ámbito estatal: cualquier residente en España puede presentarse"
          : `Abierta a toda España: no exige vivir en ${call.region ?? "la zona que la organiza"}`;
    else reason = `Vives en ${territoryName(profile.territory!)}: cumple el requisito de ${place}`;
  } else if (t === "fail") reason = `Exige residencia o sede en ${place}`;
  else reason = `Confírmalo: exige residencia en ${place} y no sabemos dónde vives`;
  return { rule: "territory", result: t, reason };
}
