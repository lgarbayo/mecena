/**
 * AI interface. Every Claude call in Mecena goes through one of these methods.
 * Each method has a real implementation (Claude via src/server/ai/llm.ts) and a deterministic mock,
 * both living in the owning feature folder (src/features/<feature>/ai.ts). src/server/ai/index.ts composes them.
 * Mock mode = no ANTHROPIC_API_KEY or MECENA_AI_MOCK=1 (always in tests).
 */
import { z } from "zod";
import {
  CallType,
  Application,
  ApplicationSection,
  BudgetLine,
  Call,
  ChecklistItem,
  CriterionScore,
  CropSuggestion,
  Dossier,
  DossierSection,
  JudgePersona,
  MatchResult,
  Profile,
  ProfileKind,
  ProfilePatch,
  TechnicalSheet,
  TranscriptSegment,
  UserFact,
  VariantFormatCheck,
  Work,
} from "./domain";

/** "fast" = claude-sonnet-5-5 (streaming-ish extraction), "smart" = claude-opus-5-5 (drafting, jury). */
export type ModelTier = "fast" | "smart";

// ---- Onboarding (WP-01) ----
export interface OnboardingTurnInput {
  kind: ProfileKind;
  profile: Profile;
  sections: DossierSection[];
  transcript: TranscriptSegment[]; // all segments so far, newest last
  newSegment: TranscriptSegment; // the chunk just spoken/typed
}
export const OnboardingTurnResult = z.object({
  profilePatch: ProfilePatch, // only fields supported by what the user said
  sectionUpdates: z.array(DossierSection), // replace-by-key; only sections that changed
  followUpQuestion: z.string().optional(), // short Spanish prompt to keep the user talking
});
export type OnboardingTurnResult = z.infer<typeof OnboardingTurnResult>;

// ---- Works / vision (WP-02) ----
export interface DescribeWorkInput {
  kind: ProfileKind;
  imageBase64: string; // no data: prefix
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  voiceDescription?: string; // what the user said about this piece
  profile?: Profile;
}
export const DescribeWorkResult = z.object({
  sheet: TechnicalSheet,
  crop: CropSuggestion, // framing of the artwork inside the photo; identity crop if unsure
  confidence: z.number().min(0).max(1),
  // true when vision could not run (API error, refusal): the sheet comes from the voice note only.
  fallback: z.boolean().optional(),
});
export type DescribeWorkResult = z.infer<typeof DescribeWorkResult>;

// ---- Matching (WP-06) ----
export interface ExplainFitInput {
  profile: Profile;
  call: Call;
  ruleReasons: string[];
  ruleMissing: string[];
}
export const ExplainFitResult = z.object({
  whyYouFit: z.array(z.string()).max(4),
  whatYouMiss: z.array(z.string()).max(4),
  plainSummary: z.string(),
});
export type ExplainFitResult = z.infer<typeof ExplainFitResult>;

// ---- Dossier call variant (WP-03, CCR-7) ----
export interface AdaptDossierInput {
  profile: Profile;
  call: Call;
  sections: DossierSection[]; // the base dossier, written from the user's words
  works: Work[]; // already ordered/capped by the rules variant
  transcript: TranscriptSegment[];
  match: MatchResult; // deterministic eligibility + fit from WP-06 (never re-decided by the model)
}
// No defaults here: this schema is sent to Claude as the structured output format.
const AdaptedSection = z.object({ id: z.string(), heading: z.string(), body: z.string(), criteria: z.array(z.string()), from: z.array(z.string()) });
export const AdaptDossierResult = z.object({
  strategy: z.string(),
  sections: z.array(AdaptedSection),
  omitted: z.array(z.object({ what: z.string(), why: z.string() })),
  questions: z.array(z.object({ criterionId: z.string(), question: z.string() })),
  formatChecks: z.array(VariantFormatCheck),
});
export type AdaptDossierResult = z.infer<typeof AdaptDossierResult>;

// ---- Calls ingest (WP-05) ----
export interface StructureCallInput {
  rawText: string; // bases / BDNS record text
  sourceUrl: string;
  bdnsId?: string;
}
// returns a Call (validated with the Call schema)

// ---- Deep research (Pro): private calls found on the web for one profile ----
export interface DeepResearchInput {
  profile: Profile;
  today: string; // YYYY-MM-DD (Spain)
  maxSearches: number; // web searches across the whole run
  maxOutputTokens: number; // per request
  maxTotalTokens: number; // input + output across the run
}
// No defaults here: this schema is sent to Claude as the structured output format (fallback pass).
export const DeepResearchCandidate = z.object({
  title: z.string(),
  organizer: z.string(),
  type: CallType,
  url: z.string().describe("URL exacta de la convocatoria o sus bases, vista durante la búsqueda; vacía si no la hay"),
  deadline: z.string().nullable().describe("YYYY-MM-DD o null si no se conoce"),
  deadlineText: z.string(),
  amountText: z.string(),
  summary: z.string(),
  disciplines: z.array(z.string()),
  beneficiaryKinds: z.array(ProfileKind),
  region: z.string().nullable(),
  requirements: z.array(z.string()),
});
export type DeepResearchCandidate = z.infer<typeof DeepResearchCandidate>;
export const DeepResearchCandidates = z.object({ candidates: z.array(DeepResearchCandidate) });
export interface DeepResearchResult {
  candidates: DeepResearchCandidate[]; // raw, unvalidated: the service checks them against the Call schema
  sourceUrls: string[]; // every URL the web search returned (a candidate's URL must come from one of these sites)
  searches: number;
  inputTokens: number;
  outputTokens: number;
}

// ---- Drafting (WP-08) ----
export interface DraftApplicationInput {
  profile: Profile;
  call: Call;
  transcript: TranscriptSegment[];
  dossier?: Dossier;
  works: Work[];
}
export const ApplicationDraftContent = z.object({
  sections: z.array(ApplicationSection),
  budget: z.array(BudgetLine),
  checklist: z.array(ChecklistItem),
});
export type ApplicationDraftContent = z.infer<typeof ApplicationDraftContent>;

export interface ReviseApplicationInput {
  call: Call;
  application: Application;
  transcript: TranscriptSegment[];
  fixes: string[]; // from the jury, accepted by the user
  facts?: UserFact[]; // data the user typed for some fixes: their own words, never invented
  weakest?: { name: string; points: number; maxPoints: number; comments: string[] }[]; // lowest-scored criteria first
  works?: Work[];
}

// ---- Jury (WP-09) ----
export interface JudgeApplicationInput {
  call: Call;
  application: Application;
  judge: JudgePersona;
  works?: Work[]; // technical sheets of the user's works (the judges see no images)
}
export const JudgeVerdict = z.object({
  judgeId: z.string(),
  scores: z.array(z.object({ criterionId: z.string(), points: z.number(), comment: z.string(), fixes: z.array(z.string()) })),
  overall: z.string(),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdict>;
export type { CriterionScore };

export interface AiService {
  readonly mode: "anthropic" | "mock";
  onboardingTurn(input: OnboardingTurnInput): Promise<OnboardingTurnResult>;
  describeWork(input: DescribeWorkInput): Promise<DescribeWorkResult>;
  explainFit(input: ExplainFitInput): Promise<ExplainFitResult>;
  adaptDossier(input: AdaptDossierInput): Promise<AdaptDossierResult>;
  structureCall(input: StructureCallInput): Promise<Call>;
  deepResearch(input: DeepResearchInput): Promise<DeepResearchResult>;
  draftApplication(input: DraftApplicationInput): Promise<ApplicationDraftContent>;
  reviseApplication(input: ReviseApplicationInput): Promise<ApplicationDraftContent>;
  judgeApplication(input: JudgeApplicationInput): Promise<JudgeVerdict>;
}

/** Per-feature slice: each feature's ai.ts exports an object implementing its methods. */
export type AiSlice<K extends keyof Omit<AiService, "mode">> = {
  real: Pick<AiService, K>;
  mock: Pick<AiService, K>;
};
