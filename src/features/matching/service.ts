// Owned by WP-06. Eligibility and score are deterministic (./rules); Claude only explains (./ai), cached in matchCache.
import { type Call, type MatchResult, type PastAward, type Profile, type ProfileKind } from "@/contracts";
import type { CallsDiagnostics } from "@/contracts/api";
import { resolveEntitlement } from "@/features/purchases/server";
import { winnerShareFor } from "@/features/history/history";
import { disciplineLabel, isDisciplineId, mapProfileKind, normalizeCall, normalizeDiscipline, profileBeneficiaryTypes } from "@/features/normalize";
import { getAi } from "@/server/ai";
import { getCall, getCallHistory, getDossier, getProfile, listAwards, listCalls, listWorks, readDb, updateDb } from "@/server/store";
import { getProfileSearch, scheduleProfileSearch } from "@/features/calls-ingest/live";
import { checklistFor, evaluate, type MatchContext, type ScoreBreakdown } from "./rules";
import { matchesQuery } from "./search";
import { applyFreeMatchLimit, canSeeCall, lockedMatch, visibleCalls } from "./usage";

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
  return rankCallsFor(profile, { ...contextFor(profile), ...(input.now ? { now: input.now } : {}) }, input);
}

/**
 * rankCalls for a profile the caller already holds, with its own context. The B2B panel uses it for the demo
 * members, who are scenario files and not stored profiles.
 */
export function rankCallsFor(profile: Profile, ctx: MatchContext, input: { query?: string; kind?: ProfileKind; limit?: number } = {}): { results: Ranked[]; stats: FeedStats } {
  const q = input.query?.trim();
  // A pyme only sees aid open to businesses: artist becas/premios are for someone else. Creators keep business-tagged
  // calls (an autónomo artist can apply for autónomo aid). An explicit `kind` (agent/MCP) still wins.
  const forBusinessOnly = !input.kind && profile.kind === "business";
  const pool = listCalls()
    .filter((c) => !input.kind || c.beneficiaryKinds.includes(input.kind))
    .filter((c) => !forBusinessOnly || openToCompanies(c))
    .filter((c) => matchesQuery(c, q))
    .map((call) => ({ call, r: evaluate(profile, call, ctx) }))
    .filter(({ r }) => !r.excluded);
  const eligible = pool.filter(({ r }) => r.match.eligible);
  // Calls made for other disciplines/sectors (fit "none") are noise once the profile says what it does: out of the feed,
  // the counter and the locked cards. Only an explicit search (?q= / search_calls query) can find them.
  const declares = profile.kind === "creator" ? profile.disciplines.length > 0 : Boolean(profile.sector || profile.cnae);
  const onTopic = declares && !q ? eligible.filter(({ r }) => r.fit !== "none") : eligible;
  const kept = onTopic;
  const results = kept
    // Open and upcoming calls come first, and a closed edition ("recurring") always goes behind all of them. Inside
    // each group the personal score decides; the soonest deadline only breaks ties.
    .sort(
      (a, b) =>
        Number(a.call.status === "recurring") - Number(b.call.status === "recurring") ||
        b.r.match.score - a.r.match.score ||
        STATUS_RANK[a.call.status] - STATUS_RANK[b.call.status] ||
        (a.call.deadline ?? "9999").localeCompare(b.call.deadline ?? "9999"),
    )
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

/**
 * searchCalls with the free plan applied (what src/tools must use): beyond the month's 3 matches a free user gets a
 * limited preview (`locked: true`, `paywall: "match_limit"`). `appUserId` comes from the ToolContext, never the model.
 */
export async function searchCallsForUser(input: Parameters<typeof searchCalls>[0] & { appUserId: string }) {
  const { appUserId, ...rest } = input;
  const now = input.now ? { now: input.now } : {};
  const profileComplete = profileSummary(getProfile(input.profileId)).isComplete;
  // incomplete profile + search: the preview is the first calls of the general ranking, never picked by the query
  const previewCandidates =
    profileComplete || !rest.query ? undefined : openIds((await searchCalls({ profileId: rest.profileId, kind: rest.kind, ...now })));
  return applyFreeMatchLimit(await searchCalls(rest), { appUserId, profileId: input.profileId, profileComplete, previewCandidates, ...now });
}

const openIds = (ranked: readonly Ranked[]) => ranked.filter((r) => r.call.status !== "recurring").map((r) => r.call.id);

export function profileSummary(profile: Profile): CallsDiagnostics["profileSummary"] {
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

/**
 * Feed for GET /api/calls. Pro sees every match. The free plan gets FREE_MATCHES_PER_MONTH real matches a month (counted
 * in db.usage, in rank order, never a closed edition); the rest are only a count. Closed editions ("recurring") go in
 * their own list, `editions` ("Próximas ediciones"), as a limited preview.
 */
export async function callsFeed(input: { profileId: string; appUserId: string; query?: string; now?: Date }) {
  const profile = getProfile(input.profileId);
  const appUserId = input.appUserId; // resolved from the session by the route
  // Search BDNS for this profile in the background when its searches are new or a day old (never blocks the feed).
  const scheduled = scheduleProfileSearch({ profileId: profile.id, appUserId });
  const search = getProfileSearch(profile.id, appUserId);
  const { results: ranked, stats } = rankCalls({ profileId: profile.id, query: input.query, ...(input.now ? { now: input.now } : {}) });
  const { pro } = await resolveEntitlement(appUserId);
  const now = input.now ? { now: input.now } : {};
  const who = { appUserId, profileId: profile.id, ...now };
  const current = ranked.filter((r) => r.call.status !== "recurring");
  const editions = ranked.filter((r) => r.call.status === "recurring").map((r) => (pro ? r : { ...r, match: lockedMatch(r.match) }));
  const summary = profileSummary(profile);
  let results = current;
  if (!pro) {
    // Incomplete profile: a preview that spends nothing, and a search never chooses it (see visibleCalls).
    const candidates = summary.isComplete || !input.query ? openIds(current) : openIds(rankCalls({ profileId: profile.id, ...now }).results);
    const visible = await visibleCalls({ ...who, profileComplete: summary.isComplete }, candidates);
    results = current.filter((r) => visible.has(r.call.id));
  }
  const liveSearch = {
    searching: scheduled === "scheduled" || scheduled === "running" || search?.status === "running",
    found: search?.callIds.length ?? 0,
    ...(search?.lastRunAt ? { lastRunAt: search.lastRunAt } : {}),
  };
  const diagnostics: CallsDiagnostics = { ...stats, matchedCount: current.length, profileSummary: summary };
  return { results, editions, lockedCount: current.length - results.length, mode: profile.kind, pro, liveSearch, diagnostics };
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

/**
 * Winners shown to a business: one row per beneficiary and year (BDNS repeats a beneficiary per instalment/top-up),
 * amounts summed, so a company is never listed twice for the same edition.
 */
export function aggregateAwards(awards: PastAward[]): PastAward[] {
  const by = new Map<string, PastAward>();
  for (const a of awards) {
    const key = `${a.beneficiary.trim().toLowerCase()}|${a.year}`;
    const prev = by.get(key);
    if (!prev) by.set(key, { ...a });
    else if (a.amountEur !== undefined) prev.amountEur = (prev.amountEur ?? 0) + a.amountEur;
  }
  return [...by.values()];
}

/**
 * "Ganadores parecidos a ti" for a creator: BDNS lists winners as people, so instead of naming anyone we show an
 * anonymous aggregate from the call's history (how many were awarded in the latest edition and the amounts).
 */
export function anonymousWinners(history: ReturnType<typeof getCallHistory> | undefined | null): { text: string } | null {
  const ed = history?.editions.filter((e) => e.awards > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!ed) return null;
  const year = ed.date.slice(0, 4);
  const people = ed.awards === 1 ? "1 persona premiada" : `${ed.awards} personas premiadas`;
  const lo = ed.amountMinEur;
  const hi = ed.amountMaxEur;
  const money = lo !== undefined && hi !== undefined ? (lo === hi ? `, importe ${formatEur(lo)}` : `, importes de ${formatEur(lo)} a ${formatEur(hi)}`) : "";
  return { text: `${people} en ${year}${money}. Orientativo, no es una probabilidad.` };
}
const formatEur = (n: number) => `${Math.round(n).toLocaleString("es-ES")} €`;

/** Detail for GET /api/calls/[id]: explanation + visible score breakdown + checklist with what the user already has. */
export async function callDetail(input: { callId: string; profileId: string; appUserId: string; now?: Date }) {
  const profile = getProfile(input.profileId);
  const call = getCall(input.callId);
  // Free plan: a call beyond the month's 3 matches shows only the public call data and the score (no AI, no reasons).
  // A closed edition never uses one of the 3.
  const pro = (await resolveEntitlement(input.appUserId)).pro;
  const open = pro || call.status === "recurring" || (await canSeeCall({ appUserId: input.appUserId, profileId: profile.id, callId: call.id, pro, ...(input.now ? { now: input.now } : {}) }));
  if (!open) {
    const ctx = contextFor(profile);
    const { match, breakdown } = evaluate(profile, call, ctx);
    return {
      call,
      match: lockedMatch(match),
      checklist: [] as string[],
      breakdown,
      checklistItems: [] as ReturnType<typeof checklistFor>,
      similarAwards: [] as PastAward[],
      history: null as ReturnType<typeof getCallHistory> | null,
      winnerShare: null as ReturnType<typeof winnerShareFor> | null,
      anonymousWinners: null as { text: string } | null,
      locked: true as const,
      paywall: "match_limit" as const,
    };
  }
  const base = await explainCall({ callId: input.callId, profileId: profile.id });
  const ctx = contextFor(profile);
  const breakdown: ScoreBreakdown = evaluate(profile, base.call, ctx).breakdown;
  const history = getCallHistory(base.call.id) ?? null;
  const types = profile.beneficiaryTypes.length ? profile.beneficiaryTypes : profileBeneficiaryTypes(profile);
  return {
    ...base,
    breakdown,
    checklistItems: checklistFor(profile, base.call, ctx),
    similarAwards: profile.kind === "business" ? aggregateAwards(similarAwards(base.call, 12, profile.kind)).slice(0, 3) : similarAwards(base.call, 3, profile.kind),
    // A creator never sees named winners (BDNS awards are companies): an anonymous aggregate instead.
    anonymousWinners: profile.kind === "creator" && history ? anonymousWinners(history) : null,
    history, // B3: past editions, success rate and cutoff when published
    winnerShare: history ? (winnerShareFor(history, types) ?? null) : null, // share of past winners of the profile's type
    locked: false as const,
    paywall: undefined,
  };
}
