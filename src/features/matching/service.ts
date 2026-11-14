// Owned by WP-06. Eligibility and score are deterministic (./rules); Claude only explains (./ai), cached in matchCache.
import { FREE_MATCHES_PER_MONTH, type Call, type MatchResult, type PastAward, type Profile, type ProfileKind } from "@/contracts";
import type { CallsDiagnostics } from "@/contracts/api";
import { resolveEntitlement } from "@/features/purchases/server";
import { winnerShareFor } from "@/features/history/history";
import { disciplineLabel, isDisciplineId, mapProfileKind, normalizeCall, normalizeDiscipline, profileBeneficiaryTypes } from "@/features/normalize";
import { getAi } from "@/server/ai";
import { getCall, getCallHistory, getDossier, getProfile, listAwards, listCalls, listWorks, readDb, updateDb } from "@/server/store";
import { getProfileSearch, scheduleProfileSearch } from "@/features/calls-ingest/live";
import { checklistFor, evaluate, type MatchContext, type ScoreBreakdown } from "./rules";

export { fitLabel, evaluate, daysLeft, type ScoreBreakdown, type FitLabel } from "./rules";

function contextFor(profile: Profile): MatchContext {
  return { hasDossier: Boolean(getDossier(profile.id)), worksCount: listWorks(profile.id).length };
}

/** Deterministic match for one call. `ctx` defaults to what the store knows (dossier, works) and today. */
export function ruleMatch(profile: Profile, call: Call, ctx?: MatchContext): MatchResult {
  return evaluate(profile, call, ctx ?? contextFor(profile)).match;
}

export interface FeedStats {
  totalEvaluated: number; // open/upcoming calls for this kind of profile (after the text query)
  discardedByEligibility: number; // requirements, territory or legal form rule them out
  discardedByDiscipline: number; // made for other disciplines/sectors than the profile's
}

type Ranked = { call: Call; match: MatchResult; breakdown: ScoreBreakdown };

/** Ranks the calls for a profile and reports the funnel (evaluated → discarded → matched). */
export function rankCalls(input: { profileId: string; query?: string; kind?: ProfileKind; limit?: number; now?: Date }): { results: Ranked[]; stats: FeedStats } {
  const profile = getProfile(input.profileId);
  const ctx: MatchContext = { ...contextFor(profile), ...(input.now ? { now: input.now } : {}) };
  const q = input.query?.trim().toLowerCase();
  // A pyme only sees aid open to businesses: artist becas/premios are for someone else. Creators keep business-tagged
  // calls (an autónomo artist can apply for autónomo aid). An explicit `kind` (agent/MCP) still wins.
  const forBusinessOnly = !input.kind && profile.kind === "business";
  const pool = listCalls()
    .filter((c) => !input.kind || c.beneficiaryKinds.includes(input.kind))
    .filter((c) => !forBusinessOnly || openToCompanies(c))
    .filter((c) => !q || `${c.title} ${c.summary} ${c.disciplines.join(" ")} ${c.sectors.join(" ")} ${c.organizer}`.toLowerCase().includes(q))
    .map((call) => ({ call, r: evaluate(profile, call, ctx) }))
    .filter(({ r }) => !r.excluded);
  const eligible = pool.filter(({ r }) => r.match.eligible);
  // Once a creator has known disciplines, calls explicitly restricted to other disciplines are noise.
  // For business or calls open to companies, keep eligible calls so general business aid and open calls stay accessible.
  const dropNoise = profile.kind === "creator" && profile.disciplines.length > 0;
  const onTopic = dropNoise ? eligible.filter(({ r }) => r.fit !== "none") : eligible;
  const kept = onTopic.length ? onTopic : eligible;
  const results = kept
    // The personal score decides the order; status (open → upcoming → recurring) and the soonest deadline only break
    // ties. Whether you can apply now is part of the score (timing), so with the same fit an open call ranks first.
    .sort((a, b) => b.r.match.score - a.r.match.score || STATUS_RANK[a.call.status] - STATUS_RANK[b.call.status] || (a.call.deadline ?? "9999").localeCompare(b.call.deadline ?? "9999"))
    .slice(0, input.limit ?? 25)
    .map(({ call, r }) => ({ call, match: r.match, breakdown: r.breakdown }));
  return {
    results,
    stats: { totalEvaluated: pool.length, discardedByEligibility: pool.length - eligible.length, discardedByDiscipline: eligible.length - kept.length },
  };
}

export async function searchCalls(input: { profileId: string; query?: string; kind?: ProfileKind; limit?: number; now?: Date }): Promise<Ranked[]> {
  return rankCalls(input).results;
}

function profileSummary(profile: Profile): CallsDiagnostics["profileSummary"] {
  const location = [...new Set([profile.city, profile.province, profile.region].filter((v): v is string => Boolean(v)))].join(", ");
  const disciplines = profile.disciplines.map((d) => (isDisciplineId(d) ? disciplineLabel(d).toLowerCase() : d));
  const what = profile.kind === "creator" ? disciplines.length > 0 : Boolean(profile.sector || profile.cnae);
  return {
    displayName: profile.displayName ?? "",
    kind: profile.kind,
    disciplines,
    ...(profile.sector ? { sector: profile.sector } : {}),
    ...(location ? { location } : {}),
    ...(profile.legalForm ? { legalForm: profile.legalForm } : {}),
    fundingNeeds: profile.fundingNeeds ?? [],
    ...(profile.projectIdea ? { projectIdea: profile.projectIdea } : {}),
    // Enough to personalise: what you do plus where you are or what you want to fund.
    isComplete: what && Boolean(location || profile.projectIdea || profile.fundingNeeds?.length),
  };
}

/**
 * A call a company can apply for: tagged for businesses, or an artist-tagged call whose canonical beneficiary types
 * also admit companies (e.g. a short-film festival open to production companies). "autonomo" alone does not count:
 * it is shared with creators, and a natural-person beca that admits autónomos is still an artist's beca.
 */
function openToCompanies(c: Call): boolean {
  if (c.beneficiaryKinds.includes("business")) return true;
  return normalizeCall(c).value.beneficiaryTypes.some((t) => {
    const kinds = mapProfileKind(t);
    return kinds.includes("business") && !kinds.includes("creator");
  });
}

const STATUS_RANK: Record<Call["status"], number> = { open: 0, upcoming: 1, recurring: 2, closed: 3 };

const cacheKey = (profile: Profile, call: Call) => `${profile.id}|${profile.updatedAt}|${call.id}|${call.verifiedAt}`;

/** Rule match + AI explanation (cached per profile version × call version). Eligibility and score stay the rules'. */
export async function explainCall(input: { callId: string; profileId: string }): Promise<{ call: Call; match: MatchResult; checklist: string[] }> {
  const profile = getProfile(input.profileId);
  const call = getCall(input.callId);
  const base = ruleMatch(profile, call);
  const key = cacheKey(profile, call);

  const cached = readDb().matchCache.find((m) => m.cacheKey === key);
  if (cached) {
    // Only the wording is cached: score and eligibility always come from the current rules.
    const { cacheKey: _k, ...match } = cached;
    return { call, match: { ...match, score: base.score, eligible: base.eligible }, checklist: call.requiredDocuments };
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
export async function callsFeed(input: { profileId: string; appUserId: string; query?: string }) {
  const profile = getProfile(input.profileId);
  const appUserId = input.appUserId; // resolved from the session by the route
  // Search BDNS for this profile in the background when its searches are new or a day old (never blocks the feed).
  const scheduled = scheduleProfileSearch({ profileId: profile.id, appUserId });
  const search = getProfileSearch(profile.id, appUserId);
  const { results: all, stats } = rankCalls({ profileId: profile.id, query: input.query });
  const { pro } = await resolveEntitlement(appUserId);
  const results = pro ? all : all.slice(0, FREE_MATCHES_PER_MONTH);
  const liveSearch = {
    searching: scheduled === "scheduled" || scheduled === "running" || search?.status === "running",
    found: search?.callIds.length ?? 0,
    ...(search?.lastRunAt ? { lastRunAt: search.lastRunAt } : {}),
  };
  const diagnostics: CallsDiagnostics = { ...stats, matchedCount: all.length, profileSummary: profileSummary(profile) };
  return { results, lockedCount: all.length - results.length, mode: profile.kind, pro, liveSearch, diagnostics };
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
export async function callDetail(input: { callId: string; profileId: string }) {
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
