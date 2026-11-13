/** Canonical shapes produced by the normalisers. These are the comparable form of Profile and Call. */
import { z } from "zod";
import { BeneficiaryType } from "./taxonomy";

export const WarningCode = z.enum([
  "unmapped-discipline",
  "unmapped-territory",
  "unmapped-beneficiary",
  "unmapped-document",
  "unmapped-cnae",
  "legacy-cnae",
  "missing-territory",
  "territory-inconsistent",
  "territory-implicit",
  "missing-beneficiary",
  "missing-legal-form",
  "missing-deadline",
  "estimated-deadline",
  "deadline-outside-calendar",
  "deadline-before-publication",
  "amount-unparsed",
  "amount-inconsistent",
  "criteria-empty",
  "criteria-sum",
  "criteria-invalid",
  "age-inconsistent",
  "invalid-record",
  "duplicate-id",
]);
export type WarningCode = z.infer<typeof WarningCode>;

export const DataWarning = z.object({
  code: WarningCode,
  severity: z.enum(["error", "warning", "info"]),
  field: z.string(), // dotted path in the source object, e.g. "eligibility.residence[0]"
  value: z.string().optional(),
  message: z.string(), // Spanish, for the data-quality report
});
export type DataWarning = z.infer<typeof DataWarning>;

/** Inclusive numeric range; undefined bound = open. */
export const Range = z.object({ min: z.number().int().optional(), max: z.number().int().optional() });
export type Range = z.infer<typeof Range>;

export const AgeRule = Range.extend({
  birthYearMin: z.number().int().optional(),
  birthYearMax: z.number().int().optional(),
});
export type AgeRule = z.infer<typeof AgeRule>;

/** Money in integer euro cents. */
export const AmountCents = z.object({
  minCents: z.number().int().nonnegative().optional(),
  maxCents: z.number().int().nonnegative().optional(),
  totalCents: z.number().int().nonnegative().optional(),
});
export type AmountCents = z.infer<typeof AmountCents>;

export const DeadlineMethod = z.enum([
  "explicit-field", // structured date from the source (fechaFinSolicitud / Call.deadline)
  "explicit-text", // a full date written in the text
  "business-days", // N días hábiles from publication
  "calendar-days", // N días naturales from publication
  "months", // N meses from publication
  "rolling", // sin plazo / abierta todo el año / hasta agotar crédito
  "unresolved",
]);
export const Deadline = z.object({
  date: z.string().nullable(), // ISO YYYY-MM-DD, last day to apply (inclusive)
  estimated: z.boolean(),
  method: DeadlineMethod,
  note: z.string().optional(),
});
export type Deadline = z.infer<typeof Deadline>;

export const CnaeRef = z.object({
  section: z.string().regex(/^[A-V]$/),
  code: z.string().optional(), // "90", "90.1", "90.12"
});
export type CnaeRef = z.infer<typeof CnaeRef>;

export const NormalizedCriterion = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  maxPoints: z.number(),
  weightPct: z.number().int().min(0).max(100), // integers summing to exactly 100 across the call
});
export type NormalizedCriterion = z.infer<typeof NormalizedCriterion>;

export const CanonicalProfile = z.object({
  id: z.string(),
  kind: z.enum(["creator", "business"]),
  beneficiaryTypes: z.array(BeneficiaryType), // empty = unknown
  territory: z.string().nullable(), // most specific territory id (mun:15030, ES111, ES11…)
  disciplines: z.array(z.string()), // discipline taxonomy ids
  cnae: CnaeRef.nullable(),
  birthYear: z.number().int().optional(),
  foundedYear: z.number().int().optional(),
  employees: z.number().int().optional(),
});
export type CanonicalProfile = z.infer<typeof CanonicalProfile>;

export const CanonicalCall = z.object({
  id: z.string(),
  beneficiaryTypes: z.array(BeneficiaryType), // empty = unknown (do not discard)
  beneficiarySource: z.enum(["explicit", "kinds", "unknown"]),
  territories: z.array(z.string()).min(1), // applicant must be within ANY of these; ["ES"] = state-wide
  disciplines: z.array(z.string()), // empty = any discipline
  sectors: z.array(CnaeRef), // empty = any sector
  amount: AmountCents,
  opensAt: z.string().optional(),
  deadline: Deadline,
  age: AgeRule,
  maxEmployees: z.number().int().optional(),
  requiredDocuments: z.array(z.string()), // document taxonomy ids
  criteria: z.array(NormalizedCriterion),
});
export type CanonicalCall = z.infer<typeof CanonicalCall>;

export interface Normalized<T> {
  value: T;
  warnings: DataWarning[];
}

export function warn(code: WarningCode, field: string, message: string, value?: string, severity: DataWarning["severity"] = "warning"): DataWarning {
  return { code, severity, field, message, ...(value !== undefined ? { value } : {}) };
}
