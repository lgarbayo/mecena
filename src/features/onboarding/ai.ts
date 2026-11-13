/**
 * Onboarding AI slice (WP-01). `real` = Claude (fast tier, effort low) with schema-validated output;
 * on any AiError it falls back to the deterministic mock for that turn so the live demo never stalls.
 */
import type { AiSlice, DossierSection, OnboardingTurnInput, OnboardingTurnResult, ProfilePatch } from "@/contracts";
import { AiError, structured } from "@/server/ai/llm";
import { sectionTitles } from "./copy";
import { mockOnboardingTurn } from "./mock";
import { llmTurnSchema, systemPrompt, userPayload, type LlmTurn } from "./prompt";

/** Map Claude's lean output onto the contract: titles, status, timestamps and grounded segment ids. */
export function toTurnResult(input: OnboardingTurnInput, out: LlmTurn): OnboardingTurnResult {
  const titles = sectionTitles(input.kind);
  const known = new Set(input.transcript.map((s) => s.id).concat(input.newSegment.id));
  const current = new Map(input.sections.map((s) => [s.key, s]));
  const sectionUpdates: DossierSection[] = [];
  for (const u of out.sectionUpdates) {
    if (!(u.key in titles) || !u.body.trim()) continue;
    const prev = current.get(u.key);
    if (prev && prev.body.trim() === u.body.trim()) continue;
    // Only ids that exist; never lose the provenance the section already had.
    const valid = u.sourceSegmentIds.filter((id) => known.has(id));
    const ids = [...new Set([...(prev?.sourceSegmentIds ?? []), ...(valid.length ? valid : [input.newSegment.id])])];
    sectionUpdates.push({ key: u.key, title: prev?.title || titles[u.key], body: u.body.trim(), sourceSegmentIds: ids, status: "draft", updatedAt: input.newSegment.at });
  }
  const profilePatch: ProfilePatch = {};
  for (const [k, v] of Object.entries(out.profilePatch)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    (profilePatch as Record<string, unknown>)[k] = v;
  }
  return { profilePatch, sectionUpdates, followUpQuestion: out.followUpQuestion?.trim() || undefined };
}

export async function realOnboardingTurn(input: OnboardingTurnInput): Promise<OnboardingTurnResult> {
  try {
    const out = await structured({
      tier: "fast",
      effort: "low",
      maxTokens: 4000,
      system: systemPrompt(input.kind),
      user: userPayload(input),
      schema: llmTurnSchema(input.kind),
    });
    return toTurnResult(input, out as LlmTurn);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    console.warn(`[onboarding] Claude failed (${e.reason}): ${e.message}. Using the deterministic extractor for this turn.`);
    return mockOnboardingTurn(input);
  }
}

export const onboardingAi: AiSlice<"onboardingTurn"> = {
  mock: {
    async onboardingTurn(input) {
      return mockOnboardingTurn(input);
    },
  },
  real: {
    onboardingTurn: realOnboardingTurn,
  },
};
