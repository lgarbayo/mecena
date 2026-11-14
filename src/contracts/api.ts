/** Request/response bodies of the HTTP API (see routes.ts for paths). Error body is always ApiError. */
import { z } from "zod";
import {
  Application,
  Call,
  CropSuggestion,
  Dossier,
  DossierSection,
  EntitlementState,
  Invoice,
  JuryScore,
  JustificationMemoria,
  MediaKind,
  MatchResult,
  PastAward,
  Profile,
  ProfileKind,
  ProfilePatch,
  TechnicalSheet,
  Work,
} from "./domain";
import { PRODUCTS } from "./purchases";

export const ApiError = z.object({
  error: z.enum(["bad_request", "unauthorized", "forbidden", "not_found", "conflict", "payment_required", "too_many_requests", "ai_failed", "internal"]),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

// Input ceilings (the AI runs on the owner's key, so nothing a client sends may grow a prompt without bound).
export const MAX_TEXT = 4000; // one spoken/typed chunk, an agent message, a voice note
export const MAX_HISTORY = 20; // agent conversation turns sent back each time
const ID = z.string().max(200);
const tooLong = (n: number) => `Este texto es demasiado largo (máximo ${n.toLocaleString("es-ES")} caracteres).`;
const userText = (n = MAX_TEXT) => z.string().max(n, tooLong(n));
/**
 * Ceiling on a whole object the user edits by hand (profile, technical sheet, draft): its fields feed later prompts, and
 * the domain schemas stay unbounded so AI-written data already stored keeps parsing.
 */
const capped = <S extends z.ZodType>(schema: S, maxChars: number) =>
  schema.refine((v) => JSON.stringify(v ?? null).length <= maxChars, "Hay demasiado texto. Acórtalo un poco y vuelve a probar.");

// /api/auth (the only API paths that work without a session)
export const AuthEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Escribe un email válido");
export const SignupRequest = z.object({
  email: AuthEmail,
  password: z.string().min(8, "La contraseña necesita al menos 8 caracteres").max(200),
  code: z.string().trim().max(200).optional(), // invite code: required when sign-up is invite-only, optional (still gifts) with MECENA_SIGNUP_OPEN=1
});
export type SignupRequest = z.infer<typeof SignupRequest>;
export const LoginRequest = z.object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(200) });
export type LoginRequest = z.infer<typeof LoginRequest>;
export const AuthUser = z.object({ id: z.string(), email: z.string() });
export type AuthUser = z.infer<typeof AuthUser>;
/** POST signup / login and GET me. */
export const MeResponse = z.object({ user: AuthUser, profile: Profile, appUserId: z.string() });
export type MeResponse = z.infer<typeof MeResponse>;
/** GET /api/auth/config: what the sign-in page needs to know before the user types. */
export const AuthConfigResponse = z.object({ signupCodeRequired: z.boolean(), signupCodeAccepted: z.boolean() });
export type AuthConfigResponse = z.infer<typeof AuthConfigResponse>;

// /api/profile (profileId, when given, must be one of the signed-in user's profiles)
export const ProfileResponse = z.object({ profile: Profile, appUserId: z.string() });
// replace: the fields sent are set as they are ("" or [] clears them) instead of merged; used when the person edits a value.
export const ProfilePatchRequest = z.object({ profileId: ID.optional(), patch: capped(ProfilePatch, 30_000), replace: z.boolean().optional() });
export const OnboardingResetRequest = z.object({ profileId: ID.optional() });
export const ProfileModeRequest = z.object({ kind: ProfileKind });

// /api/onboarding/turn
export const OnboardingTurnRequest = z.object({
  profileId: ID.optional(),
  text: userText().min(1),
  source: z.enum(["voice", "text"]),
  stepKey: z.string().optional(),
  reset: z.boolean().optional(),
});
export const OnboardingTurnResponse = z.object({
  profile: Profile,
  sections: z.array(DossierSection),
  changedSectionKeys: z.array(z.string()),
  changedProfileFields: z.array(z.string()),
  followUpQuestion: z.string().optional(),
  segmentId: z.string(),
});
export type OnboardingTurnResponse = z.infer<typeof OnboardingTurnResponse>;

// /api/onboarding/import (CCR-8): the user's existing dossier (PDF, photo of it, or pasted text) as the starting point.
export const ImportDossierRequest = z
  .object({
    profileId: ID.optional(),
    fileDataUrl: z.string().regex(/^data:(application\/pdf|image\/(jpeg|png|webp));base64,/).optional(),
    fileName: z.string().max(200).optional(),
    text: userText(60_000).optional(),
  })
  .refine((r) => !!r.fileDataUrl || !!r.text?.trim(), { message: "Sube un archivo o pega el texto de tu dossier" });
export type ImportDossierRequest = z.infer<typeof ImportDossierRequest>;
export const ImportDossierResponse = OnboardingTurnResponse.omit({ segmentId: true }).extend({
  segmentIds: z.array(z.string()), // transcript segments holding the dossier's own text (provenance for drafts)
  worksFound: z.array(z.string()), // works named in the dossier, so the UI can invite the user to photograph them
  mode: z.enum(["ai", "mock"]),
});
export type ImportDossierResponse = z.infer<typeof ImportDossierResponse>;

// /api/works
export const CreateWorkRequest = z.object({
  profileId: ID.optional(),
  imageDataUrl: z.string().startsWith("data:image/"), // size: the route's body limit and MAX_IMAGE_BYTES
  voiceDescription: userText().optional(),
  // false = store the photo only; the sheet and crop come later from POST /api/works/<id>/describe
  // (one vision call per work). Default true for MCP/agent callers.
  describe: z.boolean().optional(),
  // CCR-arts
  mediaKind: MediaKind.optional(),
  links: z.array(z.string().url().max(2000)).max(20).optional(),
});
export const UpdateWorkRequest = z.object({
  sheet: capped(TechnicalSheet.partial(), 10_000).optional(),
  crop: CropSuggestion.optional(),
  confirmed: z.boolean().optional(),
  order: z.number().int().optional(),
  // CCR-arts: links replaces the whole list; mediaKind set explicitly by the artist.
  mediaKind: MediaKind.optional(),
  links: z.array(z.string().url().max(2000)).max(20).optional(),
});
export const WorkResponse = z.object({ work: Work });
export const WorksResponse = z.object({ works: z.array(Work) });

// /api/dossier
export const DossierResponse = z.object({ dossier: Dossier, profile: Profile, works: z.array(Work) });

// /api/calls
export const CallsDiagnostics = z.object({
  totalEvaluated: z.number().int(),
  discardedByEligibility: z.number().int(),
  discardedByDiscipline: z.number().int(),
  matchedCount: z.number().int(),
  profileSummary: z.object({
    displayName: z.string(),
    kind: ProfileKind,
    disciplines: z.array(z.string()),
    sector: z.string().optional(),
    location: z.string().optional(),
    legalForm: z.string().optional(),
    fundingNeeds: z.array(z.string()),
    projectIdea: z.string().optional(),
    isComplete: z.boolean(),
  }),
});
export type CallsDiagnostics = z.infer<typeof CallsDiagnostics>;

export const CallsResponse = z.object({
  results: z.array(
    z.object({
      call: Call,
      match: MatchResult,
      // How the score was built (caps in matching/labels SCORE_MAX).
      breakdown: z.object({ base: z.number(), affinity: z.number(), documents: z.number(), amount: z.number(), timing: z.number() }).optional(),
    }),
  ),
  lockedCount: z.number().int(), // matches hidden behind the free limit
  lockedScores: z.array(z.number()).optional(), // their scores, in rank order: shown on the blurred cards, nothing else of the call
  // Closed editions of recurring calls ("Próximas ediciones"): never in the top, free plan sees them as a preview.
  editions: z.array(z.object({ call: Call, match: MatchResult })).default([]),
  mode: ProfileKind,
  pro: z.boolean().optional(),
  // Background BDNS search for this profile (step 2): the feed reloads when it finishes.
  liveSearch: z.object({ searching: z.boolean(), found: z.number().int(), lastRunAt: z.string().optional() }).optional(),
  diagnostics: CallsDiagnostics.optional(),
});
export type CallsResponse = z.infer<typeof CallsResponse>;
// /api/calls/research (Pro deep research: unverified private calls found on the web)
export const DeepResearchRequest = z.object({ profileId: ID.optional() }); // default: the user's active profile
export const DeepResearchResponse = z.object({
  status: z.enum(["idle", "running", "done", "failed", "limited"]),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  results: z.array(z.object({ call: Call, match: MatchResult })),
  discarded: z.number().int(),
  runsLeft: z.number().int(),
  freshUntil: z.string().optional(), // a new search for the same profile data returns this one until then
  message: z.string().optional(),
});
export type DeepResearchResponse = z.infer<typeof DeepResearchResponse>;
export const CallResponse = z.object({ locked: z.boolean().optional(), paywall: z.literal("match_limit").optional(), call: Call, match: MatchResult, checklist: z.array(z.string()), similarAwards: z.array(PastAward).default([]) });

// /api/applications
// appUserId is accepted for older clients but ignored: the server always uses the signed-in user's.
export const CreateApplicationRequest = z.object({ callId: ID, profileId: ID.optional(), appUserId: ID.optional() });
export const ApplicationResponse = z.object({ application: Application });
export const UpdateApplicationRequest = capped(
  z.object({ sections: Application.shape.sections.optional(), budget: Application.shape.budget.optional(), checklist: Application.shape.checklist.optional() }),
  200_000,
);

// /api/jury
// force: score again even if the current version already has a score (default: reuse it, or join the one in flight)
export const JuryRequest = z.object({ applicationId: ID, force: z.boolean().optional() });
export const JuryImproveRequest = z.object({
  applicationId: ID,
  scoreId: ID,
  fixes: z.array(userText(1000)).max(30).optional(), // must be fixes of that score (filtered server-side); omitted = all
  facts: z.array(z.object({ fix: userText(1000), text: z.string().trim().min(1).max(300) })).max(15).optional(), // data the user typed per fix
  stage: z.enum(["revise", "full"]).optional(), // "revise" = only apply the fixes (the client re-scores with progress); default "full"
});
export const JuryUndoRequest = z.object({ applicationId: ID });
// GET /api/jury?applicationId -> latest score (or null)
export const JuryLatestResponse = z.object({ score: JuryScore.nullable(), application: Application });
export const JuryResponse = z.object({ score: JuryScore, previous: JuryScore.optional(), application: Application });

// /api/entitlements
export const EntitlementResponse = z.object({ entitlement: EntitlementState });
export const EntitlementSyncRequest = z.object({
  appUserId: z.string().optional(), // ignored: the server syncs the signed-in user's app user id
  // What was just bought. Only the explicit mock mode (dev/tests) grants from it; with the RevenueCat secret key the
  // server re-reads the customer over REST. Any `pro` / `premiumCredits` a client sends is dropped by the schema.
  purchasedProductId: z.enum([PRODUCTS.proMonthly, PRODUCTS.proAnnual, PRODUCTS.solicitudPremium]).optional(),
  refresh: z.boolean().optional(), // "Restaurar compras": re-read the customer from RevenueCat
});

// /api/demo/reset
// blank = "Empezar de cero"; onboarded = "Artista de ejemplo"; pro = "Artista Pro con solicitud"; business = "Pyme de ejemplo"
export const DemoScenario = z.enum(["blank", "onboarded", "pro", "business"]);
export const DemoResetRequest = z.object({
  scenario: DemoScenario.default("blank"),
  // blank only: also load the example pyme (inactive) so the Creador/a ↔ Pyme switch has something to show
  withBusiness: z.boolean().default(false),
});
export const DemoResetResponse = z.object({
  ok: z.literal(true),
  scenario: DemoScenario,
  appUserId: z.string(),
  activeProfileId: z.string(),
  pro: z.boolean(),
  applicationId: z.string().optional(), // pro: the drafted application (open it at /tribunal/<id>)
  callId: z.string().optional(),
  invoices: z.number().int().optional(), // pro: invoices already assigned on the application (open /justificacion/<applicationId>)
  panelMembers: z.number().int().optional(), // members of the demo organisation who already accepted (open /panel)
});

// /api/demo/settings: the signed-in account's plan-B switches
export const DemoSettingsRequest = z.object({ deterministicJury: z.boolean().optional(), aiMock: z.boolean().optional() });

// /api/mcp-tokens (personal tokens for the remote MCP endpoint; only their hash is stored)
export const McpTokenInfo = z.object({ id: z.string(), label: z.string(), prefix: z.string(), createdAt: z.string(), lastUsedAt: z.string().optional() });
export type McpTokenInfo = z.infer<typeof McpTokenInfo>;
export const McpTokensResponse = z.object({ tokens: z.array(McpTokenInfo), endpoint: z.string() });
export type McpTokensResponse = z.infer<typeof McpTokensResponse>;
export const McpTokenCreateRequest = z.object({ label: z.string().trim().max(60).optional() });
/** `token` is returned only here, once: the server keeps its sha256. */
export const McpTokenCreated = z.object({ token: z.string(), info: McpTokenInfo, endpoint: z.string() });
export type McpTokenCreated = z.infer<typeof McpTokenCreated>;

// /api/agent
export const AgentRequest = z.object({
  message: userText().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: userText() }))
    .max(MAX_HISTORY, "La conversación es demasiado larga. Empieza una nueva.")
    .default([]),
});
export const AgentResponse = z.object({
  reply: z.string(),
  toolCalls: z.array(z.object({ name: z.string(), input: z.unknown(), ok: z.boolean() })),
});

// /api/justification (IDEA #7): invoices -> budget lines -> deviation alerts -> final memoria. Every call returns the whole state.
export const JustificationAlert = z.object({
  id: z.string(), // stable: kind + target
  kind: z.enum(["line_over", "total_over", "unjustified", "unassigned", "expense_not_allowed", "duplicate", "missing_data", "amount_mismatch", "low_confidence"]),
  severity: z.enum(["danger", "warn", "info"]),
  message: z.string(),
  invoiceId: z.string().optional(),
  lineConcept: z.string().optional(),
});
export type JustificationAlert = z.infer<typeof JustificationAlert>;
export const JustificationLine = z.object({
  concept: z.string(),
  expenseType: z.string(),
  budgetEur: z.number(),
  spentEur: z.number(),
  remainingEur: z.number(), // negative when over
  pct: z.number(), // spent / budget, 0..n (1 = 100 %)
  invoiceCount: z.number().int(),
});
export type JustificationLine = z.infer<typeof JustificationLine>;
export const JustificationSummary = z.object({
  lines: z.array(JustificationLine),
  budgetEur: z.number(),
  spentEur: z.number(), // assigned invoices only
  unassignedEur: z.number(),
  pct: z.number(),
  alerts: z.array(JustificationAlert),
  signature: z.string(),
});
export type JustificationSummary = z.infer<typeof JustificationSummary>;
export const JustificationResponse = z.object({
  application: Application,
  call: Call,
  invoices: z.array(Invoice),
  summary: JustificationSummary,
  memoria: JustificationMemoria.nullable(),
  memoriaStale: z.boolean(), // the invoices or the budget changed after it was drafted
  mode: z.enum(["ai", "mock"]),
});
export type JustificationResponse = z.infer<typeof JustificationResponse>;

export const MAX_INVOICES_PER_APPLICATION = 80;
export const CreateInvoiceRequest = z.object({
  applicationId: ID,
  imageDataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/, "Sube una foto de la factura (JPEG, PNG o WebP)"),
  hint: userText(300).optional(), // what the user says about it; the mock reads it, the real model gets it as context
});
export const UpdateInvoiceRequest = z.object({
  supplier: userText(200).optional(),
  taxId: userText(40).nullable().optional(),
  number: userText(60).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato AAAA-MM-DD").nullable().optional(),
  concept: userText(300).optional(),
  baseEur: z.number().min(0).max(10_000_000).nullable().optional(),
  vatEur: z.number().min(0).max(10_000_000).nullable().optional(),
  totalEur: z.number().min(0).max(10_000_000).optional(),
  expenseType: userText(120).nullable().optional(),
  lineConcept: userText(300).nullable().optional(), // null = leave it unassigned
});
export const GenerateMemoriaRequest = z.object({ applicationId: ID, notes: userText(2000).optional() });
export const SaveMemoriaRequest = z.object({
  applicationId: ID,
  sections: capped(Application.shape.sections, 100_000),
});

// /api/panel (B2B panel for schools and associations)
export const OrgCreateRequest = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["school", "association"]).default("school"),
});
export const OrgInviteRequest = z.object({ email: z.string().trim().toLowerCase().email().max(200) });
export const OrgAcceptRequest = z.object({ profileId: z.string().optional() }); // default: the account's active profile
