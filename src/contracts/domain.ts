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
  // Account (User.id) that owns this profile. Optional only so a db.json written before accounts still parses;
  // a profile without an owner is unreachable for every user.
  ownerId: z.string().optional(),
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
export const ProfilePatch = Profile.omit({ id: true, ownerId: true, kind: true, updatedAt: true, territory: true, beneficiaryTypes: true }).partial();
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
  // Technique / medium / format: "óleo sobre lino", "cuarteto de cuerda", "danza contemporánea", "novela".
  technique: z.string().optional(),
  dimensions: z.string().optional(), // "50 x 70 cm" (visual arts and objects only)
  series: z.string().optional(),
  concept: z.string().optional(), // 1-3 sentences, from the user's words
  // CCR-arts: for music, performing arts, audiovisual, literature…
  duration: z.string().optional(), // "12 min", "3:45", "90 min"
  credits: z.string().optional(), // line-up / performers / publisher / crew, free text
  venue: z.string().optional(), // where it premiered, was published or shown
});
export type TechnicalSheet = z.infer<typeof TechnicalSheet>;

/** CCR-arts: what the work is, so the dossier can show a player, a link or a cover. */
export const MediaKind = z.enum(["image", "video", "audio", "text", "performance", "object"]);
export type MediaKind = z.infer<typeof MediaKind>;

export const Work = z.object({
  id: z.string(),
  profileId: z.string(),
  // Served URL (e.g. /api/works/<id>/image or /demo/...): the photo, still, cover, poster or stage photo
  // that represents the work, whatever its art.
  imageUrl: z.string(),
  originalImageUrl: z.string().optional(),
  crop: CropSuggestion.optional(),
  // The crop vision suggested, kept apart so "Quitar recorte" can be undone ("Restaurar recorte").
  suggestedCrop: CropSuggestion.optional(),
  // How the photo was read: "ok" (vision ran), "failed" (vision unavailable: sheet from the voice only),
  // "pending" (stored, not described yet). Absent on older works.
  analysis: z.enum(["ok", "failed", "pending"]).optional(),
  sheet: TechnicalSheet,
  sheetSource: z.enum(["voice", "vision", "manual", "seed"]),
  confirmed: z.boolean().default(false), // user validated the sheet
  order: z.number().int().default(0),
  createdAt: z.string(),
  // CCR-arts
  mediaKind: MediaKind.default("image"),
  links: z.array(z.string().url()).default([]), // YouTube, Vimeo, Bandcamp, SoundCloud, Spotify, publisher page…
});
/**
 * mediaKind/links are optional in the TS type so Work literals written before CCR-arts still compile;
 * anything parsed with the schema has them filled. Read them as `w.mediaKind ?? "image"`, `w.links ?? []`.
 */
export type Work = Omit<z.infer<typeof Work>, "mediaKind" | "links"> & { mediaKind?: MediaKind; links?: string[] };

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

/** One section of a call-adapted dossier (CCR-7): rewritten for the call's criteria from the user's own facts. */
export const VariantSection = z.object({
  id: z.string(),
  heading: z.string(), // mirrors the memoria structure the bases prescribe, if any
  body: z.string(), // markdown-lite; gaps as "[PENDIENTE: …]", never invented
  criteria: z.array(z.string()).default([]), // CallCriterion ids (or requirement labels) this section serves
  from: z.array(z.string()).default([]), // base DossierSectionKeys, "profile" or "nuevo"
});
export type VariantSection = z.infer<typeof VariantSection>;

export const VariantFormatCheck = z.object({ rule: z.string(), status: z.enum(["ok", "riesgo", "no_aplica"]), note: z.string() });
export type VariantFormatCheck = z.infer<typeof VariantFormatCheck>;

export const DossierVariant = z.object({
  callId: z.string(),
  notes: z.array(z.string()), // e.g. "La convocatoria pide máx. 10 imágenes; hemos puesto primero la serie social"
  maxImages: z.number().int().optional(),
  maxFileMb: z.number().optional(),
  // CCR-7: content adaptation (layer 2). Absent = order/limits only (rules preview, non-Pro).
  strategy: z.string().optional(), // 2-3 sentences: what goes first and why, in terms of the criteria
  sections: z.array(VariantSection).optional(),
  omitted: z.array(z.object({ what: z.string(), why: z.string() })).optional(),
  questions: z.array(z.object({ criterionId: z.string(), question: z.string() })).optional(),
  formatChecks: z.array(VariantFormatCheck).optional(),
  unsupportedNumbers: z.array(z.string()).optional(), // code guard: numbers not found in profile/dossier/call
  generatedBy: z.enum(["rules", "ai", "mock"]).optional(),
  generatedAt: z.string().optional(),
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
    minEmployees: z.number().int().optional(), // "mínimo 3 personas trabajadoras": checked against profile.employees
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
  // seed = curated by hand; bdns = BDNS record structured by Claude; web = found by deep research, unverified
  source: z.enum(["seed", "bdns", "web"]),
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

/** A fact the user typed for one jury fix (a date, a figure, a name): the revision may use it as their own words. */
export const UserFact = z.object({ fix: z.string(), text: z.string() });
export type UserFact = z.infer<typeof UserFact>;

export const ApplicationRevision = z.object({
  fromScoreId: z.string(), // the jury score whose fixes were applied
  version: z.number().int(), // the application version the revision produced
  fixes: z.array(z.string()), // accepted fixes (validated against that score)
  proposed: z.number().int(), // how many fixes that score proposed
  baseTotal: z.number(), // that score's total
  facts: z.array(UserFact).default([]),
});
export type ApplicationRevision = z.infer<typeof ApplicationRevision>;

export const ApplicationSnapshot = z.object({
  version: z.number().int(),
  status: z.enum(["draft", "reviewed", "ready"]),
  sections: z.array(ApplicationSection),
  budget: z.array(BudgetLine),
  checklist: z.array(ChecklistItem),
  revision: ApplicationRevision.optional(),
});
export type ApplicationSnapshot = z.infer<typeof ApplicationSnapshot>;

export const Application = z.object({
  id: z.string(),
  profileId: z.string(),
  callId: z.string(),
  version: z.number().int().min(1), // bumps on every revision (jury fixes, user edits)
  sections: z.array(ApplicationSection),
  budget: z.array(BudgetLine),
  checklist: z.array(ChecklistItem),
  status: z.enum(["draft", "reviewed", "ready"]),
  // F: the last "Aplicar mejoras" (makes it idempotent: a retry after a failed re-score only re-scores this version).
  revision: ApplicationRevision.optional(),
  // F: the draft as it was before the last "Aplicar mejoras", so the user can undo it (they have the last word).
  previous: ApplicationSnapshot.optional(),
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
  // F: visual criterion (artistic quality, originality…) judged from the written application only (judges see no images)
  writtenOnly: z.boolean().optional(),
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
  estimated: z.boolean().optional(), // F: the criteria are estimated (the bases publish no scores)
  createdAt: z.string(),
});
export type JuryScore = z.infer<typeof JuryScore>;

export const EntitlementState = z.object({
  appUserId: z.string(),
  pro: z.boolean(),
  premiumCredits: z.number().int().min(0), // one-off "Solicitud premium" purchases not yet used
  // Credits spent on drafts. With RevenueCat: premiumCredits = unique one-off transactions - premiumUsed.
  premiumUsed: z.number().int().min(0).optional(),
  activeProductId: z.string().optional(), // "demo" = granted by the server-side demo scenario (never re-verified)
  expiresAt: z.string().optional(), // Pro ends here (re-synced lazily with RevenueCat when it passes)
  // Simulated-jury runs per application without Pro (each application includes JURY_RUNS_PER_APPLICATION).
  juryRuns: z.record(z.string(), z.number().int().min(0)).optional(),
  verifiedAt: z.string().optional(), // last successful RevenueCat REST verification
  source: z.enum(["revenuecat", "mock"]),
  updatedAt: z.string(),
});
export type EntitlementState = z.infer<typeof EntitlementState>;

/**
 * Free-plan usage (3 matched calls / month): the calls a user unlocked this month, per profile (each mode has its own 3,
 * so the demo's creator → pyme switch still shows matches). matchesViewed mirrors callIds.length for older rows.
 */
export const Usage = z.object({
  appUserId: z.string(),
  month: z.string(), // YYYY-MM, Europe/Madrid
  matchesViewed: z.number().int(),
  profileId: z.string().optional(),
  callIds: z.array(z.string()).default([]),
});
export type Usage = z.infer<typeof Usage>;

/**
 * Legacy single-user state. Still parsed so an old db.json loads, but nothing user-facing reads it any more:
 * the active profile and the RevenueCat app user id live on each User.
 */
export const AppMeta = z.object({
  activeProfileId: z.string(),
  appUserId: z.string(),
});
export type AppMeta = z.infer<typeof AppMeta>;

/** An account (email + password). Every profile, work, dossier, application and entitlement hangs from one. */
export const User = z.object({
  id: z.string(),
  email: z.string(), // normalised: trimmed, lowercase
  passwordHash: z.string(), // "scrypt$N$r$p$saltB64$hashB64"
  createdAt: z.string(),
  activeProfileId: z.string(), // one of the user's own profiles (creator or business)
  appUserId: z.string(), // RevenueCat app user id, unique per user; demo reset rotates it so the paywall shows again
});
export type User = z.infer<typeof User>;

/** A login session. Only sha256(token) is stored; the token itself lives in the httpOnly cookie. */
export const Session = z.object({
  tokenHash: z.string(),
  userId: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type Session = z.infer<typeof Session>;

/**
 * A personal access token for the remote MCP endpoint (/api/mcp), created and revoked from /cuenta.
 * Like sessions, only sha256(token) is stored; the token itself is shown once to its owner.
 */
export const McpToken = z.object({
  id: z.string(),
  userId: z.string(),
  tokenHash: z.string(),
  /** First characters of the token ("mcn_ab12…"), so the owner can tell their tokens apart. */
  prefix: z.string(),
  label: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
});
export type McpToken = z.infer<typeof McpToken>;

/** Whole JSON database. */
export const Db = z.object({
  meta: AppMeta,
  // Accounts and sessions; default [] so a db.json written before accounts existed still parses.
  users: z.array(User).default([]),
  sessions: z.array(Session).default([]),
  mcpTokens: z.array(McpToken).default([]),
  profiles: z.array(Profile),
  transcripts: z.array(Transcript),
  works: z.array(Work),
  dossiers: z.array(Dossier),
  applications: z.array(Application),
  juryScores: z.array(JuryScore),
  entitlements: z.array(EntitlementState),
  usage: z.array(Usage),
  matchCache: z.array(MatchResult.extend({ cacheKey: z.string() })),
  // CCR-7: call-adapted dossier variants, keyed by profile/dossier/works/call version (generation takes ~20 s).
  // profileId: whose variant it is, so a demo reset or an account deletion can drop it (older entries have none).
  variantCache: z.array(DossierVariant.extend({ cacheKey: z.string(), profileId: z.string().optional() })).default([]),
});
export type Db = Omit<z.infer<typeof Db>, "works"> & { works: Work[] };
