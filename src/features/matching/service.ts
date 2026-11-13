// Owned by WP-06. Eligibility and score are deterministic (./rules); Claude only explains (./ai), cached in matchCache.
import type { Call, MatchResult, Profile, ProfileKind } from "@/contracts";
import { getAi } from "@/server/ai";
import { getCall, getDossier, getProfile, listCalls, listWorks, readDb, updateDb } from "@/server/store";
import { evaluate, type MatchContext } from "./rules";

export { fitLabel, evaluate, type ScoreBreakdown, type FitLabel } from "./rules";

function contextFor(profile: Profile): MatchContext {
  return { hasDossier: Boolean(getDossier(profile.id)), worksCount: listWorks(profile.id).length };
}

/** Deterministic match for one call. `ctx` defaults to what the store knows (dossier, works) and today. */
export function ruleMatch(profile: Profile, call: Call, ctx?: MatchContext): MatchResult {
  return evaluate(profile, call, ctx ?? contextFor(profile)).match;
}

export async function searchCalls(input: { profileId?: string; query?: string; kind?: ProfileKind; limit?: number }): Promise<{ call: Call; match: MatchResult }[]> {
  const profile = getProfile(input.profileId);
  const ctx = contextFor(profile);
  const q = input.query?.trim().toLowerCase();
  return listCalls()
    .filter((c) => !input.kind || c.beneficiaryKinds.includes(input.kind))
    .filter((c) => !q || `${c.title} ${c.summary} ${c.disciplines.join(" ")} ${c.sectors.join(" ")}`.toLowerCase().includes(q))
    .map((call) => ({ call, r: evaluate(profile, call, ctx) }))
    .filter(({ r }) => !r.excluded && r.match.eligible)
    .sort((a, b) => b.r.match.score - a.r.match.score || (a.call.deadline ?? "9999").localeCompare(b.call.deadline ?? "9999"))
    .slice(0, input.limit ?? 25)
    .map(({ call, r }) => ({ call, match: r.match }));
}

const cacheKey = (profile: Profile, call: Call) => `${profile.id}|${profile.updatedAt}|${call.id}|${call.verifiedAt}`;

/** Rule match + AI explanation (cached per profile version × call version). Eligibility and score stay the rules'. */
export async function explainCall(input: { callId: string; profileId?: string }): Promise<{ call: Call; match: MatchResult; checklist: string[] }> {
  const profile = getProfile(input.profileId);
  const call = getCall(input.callId);
  const base = ruleMatch(profile, call);
  const key = cacheKey(profile, call);

  const cached = readDb().matchCache.find((m) => m.cacheKey === key);
  if (cached) {
    const { cacheKey: _k, ...match } = cached;
    return { call, match, checklist: call.requiredDocuments };
  }

  let match: MatchResult = base;
  try {
    const fit = await getAi().explainFit({ profile, call, ruleReasons: base.whyYouFit, ruleMissing: base.whatYouMiss });
    match = { ...base, ...fit, score: base.score, eligible: base.eligible, generatedBy: getAi().mode === "mock" ? "rules" : "ai" };
  } catch (e) {
    console.warn("[matching] explainFit failed, using rule output:", e instanceof Error ? e.message : e);
    return { call, match: base, checklist: call.requiredDocuments };
  }
  await updateDb((db) => {
    // drop explanations for older versions of this profile × call, then store the new one
    const stale = (k: string) => k.startsWith(`${profile.id}|`) && k.includes(`|${call.id}|`);
    db.matchCache = [...db.matchCache.filter((m) => !stale(m.cacheKey)), { ...match, cacheKey: key }];
  });
  return { call, match, checklist: call.requiredDocuments };
}
