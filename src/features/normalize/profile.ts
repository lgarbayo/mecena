/** Profile → CanonicalProfile + data-quality warnings. */
import type { Profile } from "@/contracts/domain";
import { profileBeneficiaryTypes } from "./beneficiary";
import { normalizeCnae } from "./cnae";
import { normalizeDiscipline } from "./disciplines";
import { isWithin, normalizeTerritory, territoryName } from "./territory";
import { type CanonicalProfile, type DataWarning, type Normalized, warn } from "./types";

/**
 * The profile's most specific known place: city (narrowest reading) → province → region.
 * Warns when they disagree ("Vigo" with province "Lugo") and keeps the most specific consistent one.
 */
export function profileTerritory(profile: Pick<Profile, "city" | "province" | "region">): Normalized<string | null> {
  const warnings: DataWarning[] = [];
  const fields = [
    ["city", profile.city, "narrowest"],
    ["province", profile.province, "broadest"],
    ["region", profile.region, "broadest"],
  ] as const;
  const resolved: { field: string; id: string }[] = [];
  for (const [field, value, prefer] of fields) {
    if (!value?.trim()) continue;
    let r = normalizeTerritory(value, { prefer });
    // "Lugo" in the province field means the province even if a city has the same name.
    if (field !== "city" && r.candidates.length > 1) r = normalizeTerritory(value, { prefer: "broadest" });
    if (r.id) resolved.push({ field, id: r.id });
    else warnings.push(warn("unmapped-territory", field, `No reconocemos el lugar «${value}»`, value));
  }
  if (!resolved.length) {
    warnings.push(warn("missing-territory", "city", "Falta dónde vive o tiene sede: no podemos comprobar requisitos de residencia", undefined, "info"));
    return { value: null, warnings };
  }
  // Fields are ordered specific → broad; keep the most specific and flag broader values that don't contain it.
  const first = resolved[0];
  for (const o of resolved.slice(1))
    if (!isWithin(first.id, o.id))
      warnings.push(warn("territory-inconsistent", o.field, `«${territoryName(first.id)}» no está en «${territoryName(o.id)}»`, `${first.id} ⊄ ${o.id}`));
  return { value: first.id, warnings };
}

export function normalizeProfile(profile: Profile): Normalized<CanonicalProfile> {
  const warnings: DataWarning[] = [];
  const territory = profileTerritory(profile);
  warnings.push(...territory.warnings);

  const disc = normalizeDiscipline(profile.disciplines);
  for (const u of disc.unmapped) warnings.push(warn("unmapped-discipline", "disciplines", `Disciplina sin equivalencia en la taxonomía: «${u}»`, u));
  if (profile.kind === "creator" && !profile.disciplines.length)
    warnings.push(warn("unmapped-discipline", "disciplines", "El perfil no indica disciplinas", undefined, "info"));

  const beneficiaryTypes = profileBeneficiaryTypes(profile);
  if (!beneficiaryTypes.length)
    warnings.push(warn("missing-legal-form", "legalForm", "Falta la forma jurídica (autónomo, SL, asociación…): no podemos filtrar por tipo de beneficiario", profile.legalForm));

  let cnae = null;
  if (profile.cnae) {
    const c = normalizeCnae(profile.cnae);
    cnae = c.ref;
    if (!c.ref) warnings.push(warn("unmapped-cnae", "cnae", `Código CNAE no reconocido: «${profile.cnae}»`, profile.cnae));
    else if (c.legacy) warnings.push(warn("legacy-cnae", "cnae", `CNAE-2009 ${profile.cnae} traducido a CNAE-2025 ${c.ref.code}`, profile.cnae, "info"));
  }

  return {
    value: {
      id: profile.id,
      kind: profile.kind,
      beneficiaryTypes,
      territory: territory.value,
      disciplines: disc.ids,
      cnae,
      ...(profile.birthYear !== undefined ? { birthYear: profile.birthYear } : {}),
      ...(profile.foundedYear !== undefined ? { foundedYear: profile.foundedYear } : {}),
      ...(profile.employees !== undefined ? { employees: profile.employees } : {}),
    },
    warnings,
  };
}
