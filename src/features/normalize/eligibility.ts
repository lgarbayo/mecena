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

  // Territory
  const t = territoryCheck(profile.territory, call.territories);
  const place = call.territories.map(territoryName).join(" o ");
  const stateWide = call.territories.every((x) => x === "ES" || x === "WORLD");
  checks.push({
    rule: "territory",
    result: t,
    reason:
      t === "pass"
        ? stateWide
          ? "Ámbito estatal: cualquier residente en España puede presentarse"
          : `Vives en ${territoryName(profile.territory!)}: cumple el requisito de ${place}`
        : t === "fail"
          ? `Exige residencia o sede en ${place}`
          : `Confírmalo: exige residencia en ${place} y no sabemos dónde vives`,
  });

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

  if (call.maxEmployees !== undefined && profile.kind === "business") {
    const e: CheckResult = profile.employees === undefined ? "unknown" : profile.employees <= call.maxEmployees ? "pass" : "fail";
    checks.push({ rule: "employees", result: e, reason: e === "unknown" ? `Confírmalo: máximo ${call.maxEmployees} empleados` : `Máximo ${call.maxEmployees} empleados` });
  }

  return {
    eligible: checks.every((c) => c.result !== "fail"),
    needsConfirmation: checks.some((c) => c.result === "unknown"),
    checks,
  };
}
