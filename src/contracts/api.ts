/** Request/response bodies of the HTTP API (see routes.ts for paths). Error body is always ApiError. */
import { z } from "zod";
import {
  Application,
  Call,
  CropSuggestion,
  Dossier,
  DossierSection,
  EntitlementState,
  JuryScore,
  MediaKind,
  MatchResult,
  PastAward,
  Profile,
  ProfileKind,
  ProfilePatch,
  TechnicalSheet,
  Work,
} from "./domain";

export const ApiError = z.object({
  error: z.enum(["bad_request", "unauthorized", "forbidden", "not_found", "conflict", "payment_required", "too_many_requests", "ai_failed", "internal"]),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

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
  code: z.string().trim().max(200).optional(), // invite code, required only when MECENA_SIGNUP_CODE is set
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
export const AuthConfigResponse = z.object({ signupCodeRequired: z.boolean() });
export type AuthConfigResponse = z.infer<typeof AuthConfigResponse>;

// /api/profile (profileId, when given, must be one of the signed-in user's profiles)
export const ProfileResponse = z.object({ profile: Profile, appUserId: z.string() });
export const ProfilePatchRequest = z.object({ profileId: z.string().optional(), patch: ProfilePatch });
export const ProfileModeRequest = z.object({ kind: ProfileKind });

// /api/onboarding/turn
export const OnboardingTurnRequest = z.object({
  profileId: z.string().optional(),
  text: z.string().min(1),
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
    profileId: z.string().optional(),
    fileDataUrl: z.string().regex(/^data:(application\/pdf|image\/(jpeg|png|webp));base64,/).optional(),
    fileName: z.string().max(200).optional(),
    text: z.string().max(60_000).optional(),
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
  profileId: z.string().optional(),
  imageDataUrl: z.string().startsWith("data:image/"),
  voiceDescription: z.string().optional(),
  // CCR-arts
  mediaKind: MediaKind.optional(),
  links: z.array(z.string().url()).optional(),
});
export const UpdateWorkRequest = z.object({
  sheet: TechnicalSheet.partial().optional(),
  crop: CropSuggestion.optional(),
  confirmed: z.boolean().optional(),
  order: z.number().int().optional(),
  // CCR-arts: links replaces the whole list; mediaKind set explicitly by the artist.
  mediaKind: MediaKind.optional(),
  links: z.array(z.string().url()).optional(),
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
  mode: ProfileKind,
  pro: z.boolean().optional(),
  // Background BDNS search for this profile (step 2): the feed reloads when it finishes.
  liveSearch: z.object({ searching: z.boolean(), found: z.number().int(), lastRunAt: z.string().optional() }).optional(),
  diagnostics: CallsDiagnostics.optional(),
});
export type CallsResponse = z.infer<typeof CallsResponse>;
// /api/calls/research (Pro deep research: unverified private calls found on the web)
export const DeepResearchRequest = z.object({ profileId: z.string().optional() }); // default: the user's active profile
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
export const CallResponse = z.object({ call: Call, match: MatchResult, checklist: z.array(z.string()), similarAwards: z.array(PastAward).default([]) });

// /api/applications
// appUserId is accepted for older clients but ignored: the server always uses the signed-in user's.
export const CreateApplicationRequest = z.object({ callId: z.string(), profileId: z.string().optional(), appUserId: z.string().optional() });
export const ApplicationResponse = z.object({ application: Application });
export const UpdateApplicationRequest = z.object({ sections: Application.shape.sections.optional(), budget: Application.shape.budget.optional(), checklist: Application.shape.checklist.optional() });

// /api/jury
export const JuryRequest = z.object({ applicationId: z.string() });
export const JuryImproveRequest = z.object({ applicationId: z.string(), scoreId: z.string(), fixes: z.array(z.string()).optional() });
// GET /api/jury?applicationId -> latest score (or null)
export const JuryLatestResponse = z.object({ score: JuryScore.nullable(), application: Application });
export const JuryResponse = z.object({ score: JuryScore, previous: JuryScore.optional(), application: Application });

// /api/entitlements
export const EntitlementResponse = z.object({ entitlement: EntitlementState });
export const EntitlementSyncRequest = z.object({
  appUserId: z.string().optional(), // ignored: the server syncs the signed-in user's app user id

  // mock mode: what was bought; revenuecat mode: server re-verifies via REST when a secret key exists
  purchasedProductId: z.string().optional(),
  pro: z.boolean().optional(),
  premiumCredits: z.number().int().optional(),
});

// /api/demo/reset
export const DemoResetRequest = z.object({ scenario: z.enum(["blank", "onboarded"]).default("blank") });
export const DemoResetResponse = z.object({ ok: z.literal(true), appUserId: z.string(), activeProfileId: z.string() });

// /api/agent
export const AgentRequest = z.object({
  message: z.string().min(1),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).default([]),
});
export const AgentResponse = z.object({
  reply: z.string(),
  toolCalls: z.array(z.object({ name: z.string(), input: z.unknown(), ok: z.boolean() })),
});
