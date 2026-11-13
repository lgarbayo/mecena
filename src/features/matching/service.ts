// Owned by WP-06. Eligibility and score are deterministic (./rules); Claude only explains (./ai), cached in matchCache.
import { FREE_MATCHES_PER_MONTH, type Call, type MatchResult, type PastAward, type Profile, type ProfileKind } from "@/contracts";
import { resolveEntitlement } from "@/features/purchases/server";
import { winnerShareFor } from "@/features/history/history";
import { normalizeDiscipline, profileBeneficiaryTypes } from "@/features/normalize";
import { getAi } from "@/server/ai";
import { getCall, getCallHistory, getDossier, getProfile, listAwards, listCalls, listWorks, readDb, updateDb } from "@/server/store";
import { checklistFor, evaluate, type MatchContext, type ScoreBreakdown } from "./rules";

export { fitLabel, evaluate, daysLeft, type ScoreBreakdown, type FitLabel } from "./rules";

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
    // actionable first (open → upcoming → recurring), then score, then the soonest deadline
    .sort((a, b) => STATUS_RANK[a.call.status] - STATUS_RANK[b.call.status] || b.r.match.score - a.r.match.score || (a.call.deadline ?? "9999").localeCompare(b.call.deadline ?? "9999"))
    .slice(0, input.limit ?? 25)
    .map(({ call, r }) => ({ call, match: r.match }));
}

const STATUS_RANK: Record<Call["status"], number> = { open: 0, upcoming: 1, recurring: 2, closed: 3 };

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

/** Feed for GET /api/calls: Pro sees every match; the free plan sees the top FREE_MATCHES_PER_MONTH, the rest only as a count. */
export async function callsFeed(input: { profileId?: string; appUserId?: string; query?: string }) {
  const profile = getProfile(input.profileId);
  const all = await searchCalls({ profileId: profile.id, query: input.query });
  const { pro } = await resolveEntitlement(input.appUserId);
  const results = pro ? all : all.slice(0, FREE_MATCHES_PER_MONTH);
  return { results, lockedCount: all.length - results.length, mode: profile.kind, pro };
}

/**
 * Past awards similar to this call: same call first, then same discipline family / sector. Orientative only.
 * With a profile kind, only winners of that kind ("parecidos a ti": a creator is not shown production companies).
 */
export function similarAwards(call: Call, max = 3, kind?: ProfileKind): PastAward[] {
  const awards = listAwards().filter((a) => !kind || a.beneficiaryKind === kind);
  const same = awards.filter((a) => a.callId === call.id);
  const disc = new Set(call.disciplines);
  const related = awards.filter((a) => a.callId !== call.id && a.discipline && normalizeDiscipline(a.discipline).ids.some((d) => disc.has(d)));
  return [...same, ...related].slice(0, max);
}

/** Detail for GET /api/calls/[id]: explanation + visible score breakdown + checklist with what the user already has. */
export async function callDetail(input: { callId: string; profileId?: string }) {
  const profile = getProfile(input.profileId);
  const base = await explainCall({ callId: input.callId, profileId: profile.id });
  const ctx = contextFor(profile);
  const breakdown: ScoreBreakdown = evaluate(profile, base.call, ctx).breakdown;
  const history = getCallHistory(base.call.id) ?? null;
  const types = profile.beneficiaryTypes.length ? profile.beneficiaryTypes : profileBeneficiaryTypes(profile);
  return {
    ...base,
    breakdown,
    checklistItems: checklistFor(profile, base.call, ctx),
    similarAwards: similarAwards(base.call, 3, profile.kind),
    history, // B3: past editions, success rate and cutoff when published
    winnerShare: history ? (winnerShareFor(history, types) ?? null) : null, // share of past winners of the profile's type
  };
}
