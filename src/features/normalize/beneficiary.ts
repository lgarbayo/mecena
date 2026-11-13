/**
 * Beneficiary types: canonical enum ↔ BDNS tiposBeneficiarios ↔ Mecena ProfileKind.
 * Eligibility is the intersection of the profile's types and the call's types, decided by code.
 */
import type { Profile, ProfileKind } from "@/contracts/domain";
import { taxonomy, type BeneficiaryType } from "./taxonomy";
import { fold, PhraseMatcher, unique } from "./text";

const tax = taxonomy.beneficiaries;
const matcher = new PhraseMatcher(tax.items.map((b) => ({ id: b.id, phrases: [b.id.replace(/-/g, " "), b.label.es, b.label.gl, ...b.synonyms] })));
const bdnsByText = new Map(tax.bdns.map((b) => [fold(b.descripcion), b]));
const bdnsById = new Map(tax.bdns.map((b) => [b.id, b]));

export const BENEFICIARY_TYPES = tax.items.map((b) => b.id);

export interface BeneficiaryResult {
  ids: BeneficiaryType[];
  /** True for BDNS "SIN INFORMACION ESPECIFICA" or text we could not map: never discard on it. */
  unknown: boolean;
  source: "bdns" | "text" | "none";
}

/**
 * Map one beneficiary value to canonical types. Accepts the BDNS string (any case/accents), the BDNS
 * object ({ descripcion }) or numeric id, or free text ("autónomos y pymes", "asociaciones culturales").
 */
export function normalizeBeneficiary(input: string | number | { descripcion?: string | null; id?: number | null } | null | undefined): BeneficiaryResult {
  if (input === null || input === undefined) return { ids: [], unknown: true, source: "none" };
  if (typeof input === "number") {
    const b = bdnsById.get(input);
    return b ? { ids: [...b.canonical], unknown: b.canonical.length === 0, source: "bdns" } : { ids: [], unknown: true, source: "none" };
  }
  if (typeof input === "object") {
    if (input.descripcion) return normalizeBeneficiary(input.descripcion);
    return normalizeBeneficiary(input.id ?? null);
  }
  const b = bdnsByText.get(fold(input));
  if (b) return { ids: [...b.canonical], unknown: b.canonical.length === 0, source: "bdns" };
  let hits = matcher.exact(input);
  if (!hits.length) hits = matcher.scan(input);
  if (!hits.length) hits = matcher.fuzzy(input);
  const ids = unique(hits.map((h) => h.id as BeneficiaryType));
  return { ids, unknown: ids.length === 0, source: ids.length ? "text" : "none" };
}

/** Union over several values (e.g. a BDNS tiposBeneficiarios array). Unknown only if nothing mapped. */
export function normalizeBeneficiaries(inputs: readonly Parameters<typeof normalizeBeneficiary>[0][]): BeneficiaryResult {
  const results = inputs.map((i) => normalizeBeneficiary(i));
  const ids = unique(results.flatMap((r) => r.ids));
  return { ids, unknown: ids.length === 0, source: results.some((r) => r.source === "bdns") ? "bdns" : ids.length ? "text" : "none" };
}

/** Which Mecena ProfileKind(s) a beneficiary type belongs to. "autonomo" is both creator and business. */
export function mapProfileKind(type: BeneficiaryType): ProfileKind[] {
  return [...(tax.items.find((b) => b.id === type)?.profileKinds ?? [])];
}

/** ProfileKinds a call is for, from its canonical beneficiary types (for Call.beneficiaryKinds). */
export function profileKindsFor(types: readonly BeneficiaryType[]): ProfileKind[] {
  const kinds = unique(types.flatMap(mapProfileKind));
  return (["creator", "business"] as const).filter((k) => kinds.includes(k));
}

/**
 * Canonical beneficiary types for a coarse ProfileKind when a call gives nothing finer (seed calls).
 * creator → persona física, autónomo, colectivo; business → autónomo, pyme, entidad sin ánimo de lucro.
 */
export function typesForProfileKind(kind: ProfileKind): BeneficiaryType[] {
  return kind === "creator" ? ["persona-fisica", "autonomo", "colectivo"] : ["autonomo", "pyme", "entidad-sin-animo-lucro"];
}

/**
 * What the profile legally is. Empty array = unknown (ask, don't discard).
 * - creator without legal form → persona física sin actividad económica
 * - legalForm autonomo → autónomo; sl/sa/cooperativa → pyme (or gran empresa above EU SME limits)
 * - asociacion → entidad sin ánimo de lucro
 */
export function profileBeneficiaryTypes(profile: Pick<Profile, "kind" | "legalForm" | "employees" | "annualRevenueEur">): BeneficiaryType[] {
  const lf = profile.legalForm;
  if (!lf) return profile.kind === "creator" ? ["persona-fisica"] : [];
  const mapped = tax.legalForms[lf];
  if (!mapped) return [];
  if (mapped === "pyme") {
    const big =
      (profile.employees !== undefined && profile.employees > tax.pymeLimits.maxEmployees) ||
      (profile.annualRevenueEur !== undefined && profile.annualRevenueEur > tax.pymeLimits.maxAnnualRevenueEur);
    return big ? ["gran-empresa"] : ["pyme"];
  }
  return [mapped];
}

export type CheckResult = "pass" | "fail" | "unknown";

/**
 * Can this profile apply, by beneficiary type?
 * - pass: types intersect.
 * - unknown: either side unknown, or an autónomo facing a "personas físicas sin actividad económica" call
 *   (some creation grants admit autónomos; the bases decide → "Confírmalo").
 * - fail: otherwise (a pyme never matches a persona-física-only call, and vice versa).
 */
export function beneficiaryCheck(profileTypes: readonly BeneficiaryType[], callTypes: readonly BeneficiaryType[]): CheckResult {
  if (!profileTypes.length || !callTypes.length) return "unknown";
  if (profileTypes.some((t) => callTypes.includes(t))) return "pass";
  if (profileTypes.includes("autonomo") && callTypes.includes("persona-fisica")) return "unknown";
  return "fail";
}

export function beneficiaryLabel(type: BeneficiaryType, lang: "es" | "gl" = "es"): string {
  return tax.items.find((b) => b.id === type)?.label[lang] ?? type;
}
