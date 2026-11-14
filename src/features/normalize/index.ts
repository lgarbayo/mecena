/**
 * Mecena data standard (fleet/DATA-STANDARD.md): pure, deterministic normalisers that make Profile and
 * Call comparable. Code decides eligibility; the optional AI fallback only suggests soft labels.
 */
export * from "./types";
export { taxonomy, BeneficiaryType, TerritoryLevel, DISCIPLINE_IDS, DOCUMENT_IDS, type TerritoryNode } from "./taxonomy";
export { fold, keyOf, levenshtein } from "./text";
export {
  normalizeDiscipline,
  extractDisciplines,
  disciplineLabel,
  isDisciplineId,
  disciplineAncestors,
  disciplineChildren,
  disciplinesToCnae,
  disciplineFit,
  type DisciplineResult,
  type DisciplineFit,
} from "./disciplines";
export {
  normalizeTerritory,
  extractTerritories,
  territoryNode,
  territoryName,
  territoryAncestors,
  canonicalTerritory,
  ccaaOf,
  isWithin,
  territoryCheck,
  type TerritoryResult,
  type TerritoryPreference,
} from "./territory";
export {
  BENEFICIARY_TYPES,
  normalizeBeneficiary,
  normalizeBeneficiaries,
  mapProfileKind,
  profileKindsFor,
  typesForProfileKind,
  profileBeneficiaryTypes,
  beneficiaryCheck,
  beneficiaryLabel,
  type BeneficiaryResult,
} from "./beneficiary";
export { normalizeCnae, inferCnaeFromSector, cnaeCheck, cnaeLabel, sectionOfDivision, type CnaeResult } from "./cnae";
export { parseAmount, parseAmountRange, findAmounts, parseSpanishNumber, eurosToCents, centsToEuros, formatCents } from "./money";
export {
  resolveDeadline,
  parseDeadlineText,
  addBusinessDays,
  addMonths,
  addDays,
  isBusinessDay,
  nextBusinessDay,
  holidaysFor,
  findDates,
  parseNumberWord,
  daysBetween,
  type DeadlineRule,
  type ResolveDeadlineOptions,
} from "./dates";
export { parseAgeRange, parseMinEmployees, ageRangeAt, ageCheck, parseYearsActive, yearsActiveCheck, type CheckResult } from "./ranges";
export { normalizeDocuments, documentLabel, missingDocuments, type DocumentsResult } from "./documents";
export { normalizeCriteria, largestRemainder, type CriteriaResult } from "./criteria";
export { normalizeProfile, profileTerritory } from "./profile";
export { normalizeCall, callTerritories, callBeneficiaries, withCanonicalCallFields, type NormalizeCallOptions } from "./call";
export { BdnsRecord, normalizeBdnsRecord, bdnsToCallPatch, type BdnsNormalized } from "./bdns";
export { evaluateEligibility, describeAge, type EligibilityCheck, type EligibilityResult } from "./eligibility";
export { validateCallDataset, formatQualityReport, type QualityReport, type CallQuality } from "./quality";
export { suggestForUnmapped, mockUnmappedResolver, type UnmappedResolver, type SoftVocabulary, type Suggestion } from "./ai-fallback";
