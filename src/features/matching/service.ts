// STUB (scaffold, working baseline). Owned by WP-06: real eligibility rules, ranking, AI explanations, caching.
import type { Call, MatchResult, Profile, ProfileKind } from "@/contracts";
import { getAi } from "@/server/ai";
import { getCall, getProfile, listCalls } from "@/server/store";

export function ruleMatch(profile: Profile, call: Call): MatchResult {
  const reasons: string[] = [];
  const missing: string[] = [];
  const kindOk = call.beneficiaryKinds.includes(profile.kind);
  if (kindOk) reasons.push(profile.kind === "creator" ? "Es para creadores" : "Es para pymes y autónomos");
  else missing.push("No es para tu tipo de perfil");
  return {
    callId: call.id,
    profileId: profile.id,
    score: kindOk ? 60 : 0,
    eligible: kindOk,
    whyYouFit: reasons,
    whatYouMiss: missing,
    generatedBy: "rules",
  };
}

export async function searchCalls(input: { profileId?: string; query?: string; kind?: ProfileKind; limit?: number }): Promise<{ call: Call; match: MatchResult }[]> {
  const profile = getProfile(input.profileId);
  const q = input.query?.toLowerCase();
  return listCalls()
    .filter((c) => !q || `${c.title} ${c.summary}`.toLowerCase().includes(q))
    .map((call) => ({ call, match: ruleMatch(profile, call) }))
    .filter((r) => r.match.eligible)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, input.limit ?? 25);
}

export async function explainCall(input: { callId: string; profileId?: string }): Promise<{ call: Call; match: MatchResult; checklist: string[] }> {
  const profile = getProfile(input.profileId);
  const call = getCall(input.callId);
  const base = ruleMatch(profile, call);
  const fit = await getAi().explainFit({ profile, call, ruleReasons: base.whyYouFit, ruleMissing: base.whatYouMiss });
  return { call, match: { ...base, ...fit, generatedBy: "ai" }, checklist: call.requiredDocuments };
}
