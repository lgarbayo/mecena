/** Business activity: CNAE-2025 section letters, divisions and classes (BDNS sectores[]). */
import { taxonomy } from "./taxonomy";
import { fold } from "./text";
import type { CnaeRef } from "./types";

const { sections, codes, legacy2009 } = taxonomy.cnae;
const sectionByLabel = new Map(sections.map((s) => [fold(s.label), s.code]));
const codeByLabel = new Map(codes.map((c) => [fold(c.label), c.code]));

export function sectionOfDivision(division: number): string | undefined {
  return sections.find((s) => division >= s.divisions[0] && division <= s.divisions[1])?.code;
}

export interface CnaeResult {
  ref: CnaeRef | null;
  legacy: boolean; // input was a CNAE-2009 4-digit code translated to CNAE-2025
}

/**
 * Normalise a CNAE value: section letter ("S"), division ("90"), group/class ("90.1", "90.12", "9012"),
 * BDNS { codigo, descripcion } objects, or the section/class description text.
 * Four-digit inputs are read as CNAE-2009 when listed in the crosswalk (users quote their IAE/CNAE-2009
 * code), else as CNAE-2025 "dd.dd".
 */
export function normalizeCnae(input: string | { codigo?: string | null; descripcion?: string | null } | null | undefined): CnaeResult {
  if (!input) return { ref: null, legacy: false };
  if (typeof input === "object") {
    const byCode = normalizeCnae(input.codigo ?? null);
    return byCode.ref ? byCode : normalizeCnae(input.descripcion ?? null);
  }
  const raw = input.trim();
  if (/^[A-Va-v]$/.test(raw)) return { ref: { section: raw.toUpperCase() }, legacy: false };
  const compact = raw.replace(/\s/g, "");
  if (/^\d{4}$/.test(compact) && legacy2009[compact]) return withSection(legacy2009[compact], true);
  const m = compact.match(/^(\d{2})(?:\.?(\d{1,2}))?$/);
  if (m) return withSection(m[2] ? `${m[1]}.${m[2]}` : m[1], false);
  const f = fold(raw);
  const sec = sectionByLabel.get(f);
  if (sec) return { ref: { section: sec }, legacy: false };
  const code = codeByLabel.get(f);
  if (code) return withSection(code, false);
  return { ref: null, legacy: false };
}

function withSection(code: string, legacy: boolean): CnaeResult {
  const section = sectionOfDivision(Number(code.slice(0, 2)));
  return section ? { ref: { section, code }, legacy } : { ref: null, legacy };
}

/**
 * Does a profile activity fall under a call sector? Prefix semantics on the hierarchy:
 * call "S" accepts any 90–93; call "90" accepts "90.12"; call "90.12" does not accept "90.20".
 * A profile with only a section matches a call division in that section as "unknown" (confirm).
 */
export function cnaeCheck(profile: CnaeRef | null, callSectors: readonly CnaeRef[]): "pass" | "fail" | "unknown" {
  if (!callSectors.length) return "pass";
  if (!profile) return "unknown";
  let partial = false;
  for (const s of callSectors) {
    if (s.section !== profile.section) continue;
    if (!s.code) return "pass";
    if (!profile.code) {
      partial = true;
      continue;
    }
    const a = s.code.replace(".", "");
    const b = profile.code.replace(".", "");
    if (b.startsWith(a)) return "pass";
    if (a.startsWith(b)) partial = true; // profile is coarser than the call's class
  }
  return partial ? "unknown" : "fail";
}

export function cnaeLabel(ref: CnaeRef): string {
  if (ref.code) return codes.find((c) => c.code === ref.code)?.label ?? ref.code;
  return sections.find((s) => s.code === ref.section)?.label ?? ref.section;
}
