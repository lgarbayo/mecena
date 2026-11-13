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
  MatchResult,
  PastAward,
  Profile,
  ProfileKind,
  ProfilePatch,
  TechnicalSheet,
  Work,
} from "./domain";

export const ApiError = z.object({
  error: z.enum(["bad_request", "not_found", "payment_required", "ai_failed", "internal"]),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

// /api/profile
export const ProfileResponse = z.object({ profile: Profile, appUserId: z.string() });
export const ProfilePatchRequest = z.object({ profileId: z.string().optional(), patch: ProfilePatch });
export const ProfileModeRequest = z.object({ kind: ProfileKind });

// /api/onboarding/turn
export const OnboardingTurnRequest = z.object({
  profileId: z.string().optional(),
  text: z.string().min(1),
  source: z.enum(["voice", "text"]),
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

// /api/works
export const CreateWorkRequest = z.object({
  profileId: z.string().optional(),
  imageDataUrl: z.string().startsWith("data:image/"),
  voiceDescription: z.string().optional(),
});
export const UpdateWorkRequest = z.object({ sheet: TechnicalSheet.partial().optional(), crop: CropSuggestion.optional(), confirmed: z.boolean().optional(), order: z.number().int().optional() });
export const WorkResponse = z.object({ work: Work });
export const WorksResponse = z.object({ works: z.array(Work) });

// /api/dossier
export const DossierResponse = z.object({ dossier: Dossier, profile: Profile, works: z.array(Work) });

// /api/calls
export const CallsResponse = z.object({
  results: z.array(z.object({ call: Call, match: MatchResult })),
  lockedCount: z.number().int(), // matches hidden behind the free limit
  mode: ProfileKind,
});
export type CallsResponse = z.infer<typeof CallsResponse>;
export const CallResponse = z.object({ call: Call, match: MatchResult, checklist: z.array(z.string()), similarAwards: z.array(PastAward).default([]) });

// /api/applications
export const CreateApplicationRequest = z.object({ callId: z.string(), profileId: z.string().optional(), appUserId: z.string() });
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
  appUserId: z.string(),
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
