/**
 * Domain model shared by the web app, the AI layer, the tools module and the MCP server.
 * Zod schemas are the source of truth; TS types are inferred from them.
 * Only the integrator edits this file (builders: use "Contract change requests").
 */
import { z } from "zod";

export const ProfileKind = z.enum(["creator", "business"]);
export type ProfileKind = z.infer<typeof ProfileKind>;

/** Canonical beneficiary types (fleet/DATA-STANDARD.md, data/taxonomy/beneficiary-types.json). */
export const BeneficiaryType = z.enum([
  "persona-fisica",
  "autonomo",
  "pyme",
  "gran-empresa",
  "entidad-sin-animo-lucro",
  "colectivo",
  "entidad-publica",
]);
export type BeneficiaryType = z.infer<typeof BeneficiaryType>;

/** One chunk of what the user said or typed. Drafts quote these to stay in the user's own words. */
export const TranscriptSegment = z.object({
  id: z.string(),
  text: z.string(),
  source: z.enum(["voice", "text"]),
  at: z.string(), // ISO datetime
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

export const Transcript = z.object({
  profileId: z.string(),
  segments: z.array(TranscriptSegment),
});
export type Transcript = z.infer<typeof Transcript>;

export const Profile = z.object({
  id: z.string(),
  kind: ProfileKind,
  displayName: z.string(), // artist name or trade name
  city: z.string().optional(),
  province: z.string().optional(),
  region: z.string().optional(), // comunidad autónoma, e.g. "Galicia"
  // CCR-1: canonical territory id from data/taxonomy/territories.json (mun:15030, ES111, ES11…). Derived from
  // city/province/region by the store; city/province/region stay as display text.
  territory: z.string().optional(),
  // CCR-3: canonical beneficiary types, derived from kind/legalForm/size by the store. Empty = unknown.
  beneficiaryTypes: z.array(BeneficiaryType).default([]),
  birthYear: z.number().int().optional(),
  // creator
  disciplines: z.array(z.string()).default([]), // "ilustración", "pintura", "fotografía"...
  // business
  legalForm: z.enum(["autonomo", "sl", "sa", "cooperativa", "asociacion", "otra"]).optional(),
  cnae: z.string().optional(),
  sector: z.string().optional(),
  employees: z.number().int().optional(),
  foundedYear: z.number().int().optional(),
  annualRevenueEur: z.number().optional(),
  // shared narrative
  bio: z.string().default(""),
  statement: z.string().default(""), // artist statement or company mission
  achievements: z.array(z.string()).default([]), // exhibitions, prizes, clients, projects
  education: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  fundingNeeds: z.array(z.string()).default([]), // what they want money/time for
  projectIdea: z.string().optional(), // the project they would present
  languages: z.array(z.string()).default([]),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof Profile>;

/** Partial update produced by onboarding / update_profile. Arrays are merged (deduped) by the store. */
export const ProfilePatch = Profile.omit({ id: true, kind: true, updatedAt: true, territory: true, beneficiaryTypes: true }).partial();
export type ProfilePatch = z.infer<typeof ProfilePatch>;

/** Light-touch photo correction only. We never alter the artwork itself. */
export const CropSuggestion = z.object({
  x: z.number().min(0).max(1), // normalised 0..1 relative to the original image
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  rotationDeg: z.number().min(-45).max(45).default(0),
});
export type CropSuggestion = z.infer<typeof CropSuggestion>;

export const TechnicalSheet = z.object({
  title: z.string(),
  year: z.number().int().optional(),
  technique: z.string().optional(), // "acuarela sobre papel", "óleo sobre lienzo"
  dimensions: z.string().optional(), // "50 x 70 cm"
  series: z.string().optional(),
  concept: z.string().optional(), // 1-3 sentences, from the user's words
});
export type TechnicalSheet = z.infer<typeof TechnicalSheet>;

export const Work = z.object({
  id: z.string(),
  profileId: z.string(),
  imageUrl: z.string(), // served URL (e.g. /api/works/<id>/image or /demo/...)
  originalImageUrl: z.string().optional(),
  crop: CropSuggestion.optional(),
  sheet: TechnicalSheet,
  sheetSource: z.enum(["voice", "vision", "manual", "seed"]),
  confirmed: z.boolean().default(false), // user validated the sheet
  order: z.number().int().default(0),
  createdAt: z.string(),
});
export type Work = z.infer<typeof Work>;

export const CreatorSectionKey = z.enum(["statement", "bio", "series", "works", "cv", "contact"]);
export const BusinessSectionKey = z.enum(["activity", "team", "projects", "figures", "location", "contact"]);
export const DossierSectionKey = z.union([CreatorSectionKey, BusinessSectionKey]);
export type DossierSectionKey = z.infer<typeof DossierSectionKey>;

export const DossierSection = z.object({
  key: DossierSectionKey,
  title: z.string(), // Spanish UI title, e.g. "Declaración artística"
  body: z.string(), // markdown-lite: paragraphs and "- " bullets only
  sourceSegmentIds: z.array(z.string()).default([]), // transcript segments it came from
  status: z.enum(["empty", "draft", "confirmed"]).default("draft"),
  updatedAt: z.string(),
});
export type DossierSection = z.infer<typeof DossierSection>;

export const DossierVariant = z.object({
  callId: z.string(),
  notes: z.array(z.string()), // e.g. "La convocatoria pide máx. 10 imágenes; hemos puesto primero la serie social"
  maxImages: z.number().int().optional(),
  maxFileMb: z.number().optional(),
});
export type DossierVariant = z.infer<typeof DossierVariant>;

export const Dossier = z.object({
  profileId: z.string(),
  kind: ProfileKind,
  sections: z.array(DossierSection),
  workIds: z.array(z.string()), // ordered
  variant: DossierVariant.optional(),
  generatedAt: z.string(),
});
export type Dossier = z.infer<typeof Dossier>;

export const CallType = z.enum(["beca", "premio", "residencia", "subvencion", "ayuda", "certamen", "convocatoria"]);
export const CallScope = z.enum(["local", "provincial", "autonomico", "estatal", "europeo", "privado"]);

/** One scored criterion from the call's bases. maxPoints across a call should sum to its total (usually 100). */
export const CallCriterion = z.object({
  id: z.string(),
  name: z.string(), // "Calidad y coherencia del proyecto"
  description: z.string(),
  maxPoints: z.number(),
});
export type CallCriterion = z.infer<typeof CallCriterion>;

export const Call = z.object({
  id: z.string(), // slug, stable
  title: z.string(),
  organizer: z.string(),
  type: CallType,
  scope: CallScope,
  region: z.string().optional(), // "Galicia", "A Coruña"
  beneficiaryKinds: z.array(ProfileKind).min(1),
  // CCR-6: canonical beneficiary types (from BDNS tiposBeneficiarios / legalForms). Empty = unknown, never a discard.
  beneficiaryTypes: z.array(BeneficiaryType).default([]),
  // CCR-5: canonical territory ids the applicant must live in (any of them). [] = state-wide, ["WORLD"] = anyone.
  // Source of truth for residence; eligibility.residence stays for display.
  territories: z.array(z.string()).default([]),
  disciplines: z.array(z.string()).default([]), // empty = any
  sectors: z.array(z.string()).default([]), // for business calls; empty = any
  eligibility: z.object({
    minAge: z.number().int().optional(),
    maxAge: z.number().int().optional(),
    residence: z.array(z.string()).default([]), // regions/provinces required; empty = Spain-wide
    legalForms: z.array(z.string()).default([]),
    maxEmployees: z.number().int().optional(),
    other: z.array(z.string()).default([]),
  }),
  amountEur: z.object({ min: z.number().optional(), max: z.number().optional(), total: z.number().optional() }).default({}),
  amountText: z.string(), // "Hasta 12.000 €"
  opensAt: z.string().optional(), // ISO date
  deadline: z.string().nullable(), // ISO date, null if rolling/unknown
  deadlineText: z.string(),
  status: z.enum(["open", "upcoming", "closed", "recurring"]),
  summary: z.string(), // plain-language Spanish summary of the bases
  requiredDocuments: z.array(z.string()),
  dossierRequirements: z
    .object({ maxImages: z.number().int().optional(), maxFileMb: z.number().optional(), format: z.string().optional(), notes: z.string().optional() })
    .optional(),
  criteria: z.array(CallCriterion), // from the bases; may be empty if bases do not publish them
  criteriaSource: z.enum(["bases", "estimated"]), // "estimated" = inferred, shown with a warning
  allowedExpenses: z.array(z.string()).default([]),
  sourceUrl: z.string().url(), // official page or boletín
  basesUrl: z.string().url().optional(),
  bdnsId: z.string().optional(),
  source: z.enum(["seed", "bdns"]),
  verifiedAt: z.string(), // date the data was checked
});
export type Call = z.infer<typeof Call>;

/** A past concession ("ganadores parecidos a ti"). Orientative evidence only: never turn it into a probability. */
export const PastAward = z.object({
  id: z.string(),
  callId: z.string().optional(), // our Call.id when it maps to a seeded call
  callTitle: z.string(),
  organizer: z.string(),
  year: z.number().int(),
  beneficiary: z.string(), // public name as published (BDNS concesiones / official resolution)
  beneficiaryKind: ProfileKind,
  discipline: z.string().optional(),
  amountEur: z.number().optional(),
  projectTitle: z.string().optional(),
  sourceUrl: z.string().url(),
});
export type PastAward = z.infer<typeof PastAward>;

export const MatchResult = z.object({
  callId: z.string(),
  profileId: z.string(),
  score: z.number().min(0).max(100),
  eligible: z.boolean(),
  whyYouFit: z.array(z.string()),
  whatYouMiss: z.array(z.string()),
  plainSummary: z.string().optional(),
  generatedBy: z.enum(["rules", "ai"]),
});
export type MatchResult = z.infer<typeof MatchResult>;

export const ApplicationSection = z.object({
  key: z.string(), // "memoria", "statement", "company", "objetivos", "plan", "impacto"
  title: z.string(),
  body: z.string(),
  sourceSegmentIds: z.array(z.string()).default([]), // which of the user's own words it is built on
});
export type ApplicationSection = z.infer<typeof ApplicationSection>;

export const BudgetLine = z.object({
  concept: z.string(),
  amountEur: z.number(),
  expenseType: z.string(), // must map to Call.allowedExpenses
  note: z.string().optional(),
});
export type BudgetLine = z.infer<typeof BudgetLine>;

export const ChecklistItem = z.object({ item: z.string(), done: z.boolean().default(false), hint: z.string().optional() });
export type ChecklistItem = z.infer<typeof ChecklistItem>;

export const Application = z.object({
  id: z.string(),
  profileId: z.string(),
  callId: z.string(),
  version: z.number().int().min(1), // bumps on every revision (jury fixes, user edits)
  sections: z.array(ApplicationSection),
  budget: z.array(BudgetLine),
  checklist: z.array(ChecklistItem),
  status: z.enum(["draft", "reviewed", "ready"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Application = z.infer<typeof Application>;

export const JudgePersona = z.object({
  id: z.string(),
  name: z.string(), // "Técnica de la administración", "Comisaria de arte", "Gestor cultural"
  focus: z.string(),
});
export type JudgePersona = z.infer<typeof JudgePersona>;

export const CriterionScore = z.object({
  criterionId: z.string(),
  name: z.string(),
  maxPoints: z.number(),
  byJudge: z.array(z.object({ judgeId: z.string(), points: z.number(), comment: z.string() })),
  points: z.number(), // average across judges
  fixes: z.array(z.string()), // concrete, actionable improvements
});
export type CriterionScore = z.infer<typeof CriterionScore>;

export const JuryScore = z.object({
  id: z.string(),
  applicationId: z.string(),
  applicationVersion: z.number().int(),
  judges: z.array(JudgePersona),
  criteria: z.array(CriterionScore),
  total: z.number().min(0).max(100), // normalised to 100
  summary: z.string(),
  disclaimer: z.string(), // "Simulación orientativa; no predice la resolución real."
  createdAt: z.string(),
});
export type JuryScore = z.infer<typeof JuryScore>;

export const EntitlementState = z.object({
  appUserId: z.string(),
  pro: z.boolean(),
  premiumCredits: z.number().int().min(0), // one-off "Solicitud premium" purchases not yet used
  activeProductId: z.string().optional(),
  expiresAt: z.string().optional(),
  source: z.enum(["revenuecat", "mock"]),
  updatedAt: z.string(),
});
export type EntitlementState = z.infer<typeof EntitlementState>;

/** Simple usage counters for the free plan (3 matched calls / month). */
export const Usage = z.object({ appUserId: z.string(), month: z.string(), matchesViewed: z.number().int() });
export type Usage = z.infer<typeof Usage>;

export const AppMeta = z.object({
  activeProfileId: z.string(),
  appUserId: z.string(), // RevenueCat app user id; demo reset rotates it so the paywall shows again
});
export type AppMeta = z.infer<typeof AppMeta>;

/** Whole JSON database. */
export const Db = z.object({
  meta: AppMeta,
  profiles: z.array(Profile),
  transcripts: z.array(Transcript),
  works: z.array(Work),
  dossiers: z.array(Dossier),
  applications: z.array(Application),
  juryScores: z.array(JuryScore),
  entitlements: z.array(EntitlementState),
  usage: z.array(Usage),
  matchCache: z.array(MatchResult.extend({ cacheKey: z.string() })),
});
export type Db = z.infer<typeof Db>;
