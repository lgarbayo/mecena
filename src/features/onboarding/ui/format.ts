/** Profile values as the person reads them: labels per kind, "S.L." instead of "sl", "48.000 €" instead of 48000. */
import type { Profile, ProfileKind } from "@/contracts";
import { LEGAL_FORM_LABELS, PROFILE_ROWS, fieldLabel } from "../copy";

export function profileValues(profile: Profile | null, field: string): string[] {
  if (!profile) return [];
  const v = (profile as Record<string, unknown>)[field];
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map(String).filter((x) => x.trim());
  if (field === "legalForm") return [LEGAL_FORM_LABELS[String(v)] ?? String(v)];
  if (field === "annualRevenueEur") return [`${Number(v).toLocaleString("es-ES")} €`];
  if (field === "employees") return [`${v} ${v === 1 ? "persona" : "personas"}`];
  return [String(v)];
}

/** Filled profile rows for this kind, in display order: [field, label, values]. */
export function filledRows(kind: ProfileKind, profile: Profile | null): { field: string; label: string; values: string[] }[] {
  return PROFILE_ROWS[kind]
    .map((field) => ({ field, label: fieldLabel(kind, field), values: profileValues(profile, field) }))
    .filter((r) => r.label && r.values.length > 0);
}
