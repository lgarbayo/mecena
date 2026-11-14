/**
 * Deep research (Pro): "Busca más para mí". One background Claude run with web search per profile, cached.
 *
 * Personal state only, in its own files under <MECENA_DATA_DIR> (never in db.json, never in the shared BDNS catalogue):
 * - deep-research.json: the last run per profile id, stamped with the owner's appUserId (results, status);
 * - deep-research-usage.json: the run ledger the spending caps count on. A demo reset clears the first, not this one.
 * Every entry point receives `profileId` and `appUserId` already resolved by the caller (the session, once login
 * lands) and checks ownership itself.
 *
 * Claude only finds candidates. Code validates them with the Call schema, drops the ones without a source URL that the
 * search actually returned or with a past deadline, and the rules decide eligibility and score, as for any call.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Call, NotFoundError, PaymentRequiredError, type DeepResearchCandidate, type MatchResult, type Profile } from "@/contracts";
import { normalizeDiscipline, withCanonicalCallFields } from "@/features/normalize";
import { evaluate } from "@/features/matching/rules";
import { resolveEntitlement } from "@/features/purchases/server";
import { getAi } from "@/server/ai";
import { dataDir, getDossier, getProfile, listCalls, listWorks } from "@/server/store";

// ---------- limits (the AI runs on the owner's key) ----------
export const DEEP_RESEARCH_LIMITS = {
  maxSearches: 8, // web searches per run, hard ceiling (4 per request, at most 2 requests that may search)
  maxOutputTokens: 12_000, // per request
  maxTotalTokens: 250_000, // input + output across the run (search results are input)
  cacheDays: 7, // a finished run for the same profile data is reused for a week
  runsPerProfilePerMonth: 3,
  runsPerUserPerMonth: 6,
  runsPerDayOverall: 30, // every user together: a hard ceiling on the owner's daily spend
  maxResults: 10,
  /** A run still "running" after this (or one this process does not know: a restart) is reported as interrupted. */
  staleRunMinutes: 15,
} as const;
const MONTH_MS = 30 * 864e5;
const DAY_MS = 864e5;

// ---------- state files ----------
const DeepResearchState = z.object({
  profileId: z.string(),
  appUserId: z.string(), // owner
  signature: z.string(), // profile data the run was based on
  status: z.enum(["running", "done", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  calls: z.array(Call).default([]), // validated, unverified ("web") calls
  discarded: z.number().int().default(0),
  searches: z.number().int().default(0),
  tokens: z.number().int().default(0),
  error: z.string().optional(),
});
export type DeepResearchState = z.infer<typeof DeepResearchState>;
// userId: the account. A demo reset gives the account a new profile and a new appUserId, so the per-user cap counts by
// userId (entries written before it existed fall back to appUserId).
const UsageEntry = z.object({ profileId: z.string(), appUserId: z.string(), userId: z.string().optional(), at: z.string() });
type UsageEntry = z.infer<typeof UsageEntry>;

const stateFile = () => path.join(dataDir(), "deep-research.json");
const usageFile = () => path.join(dataDir(), "deep-research-usage.json");

function readJsonFile(f: string): unknown {
  try {
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : undefined;
  } catch (e) {
    console.warn(`[deep-research] unreadable ${path.basename(f)}, starting empty:`, e instanceof Error ? e.message : e);
    return undefined;
  }
}

function readAll(): Record<string, DeepResearchState> {
  const raw = (readJsonFile(stateFile()) ?? {}) as Record<string, unknown>;
  const out: Record<string, DeepResearchState> = {};
  for (const [k, v] of Object.entries(raw)) {
    const r = DeepResearchState.safeParse(v);
    if (r.success) out[k] = r.data;
  }
  return out;
}

function readUsage(): UsageEntry[] {
  const raw = readJsonFile(usageFile());
  return Array.isArray(raw) ? raw.flatMap((x) => (UsageEntry.safeParse(x).success ? [x as UsageEntry] : [])) : [];
}

function writeFile(f: string, value: unknown) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, f);
}

/**
 * Process-wide state on globalThis (Next bundles each route separately, and the demo reset route must see the same
 * queue and jobs as the research route): one serialised queue for both files, the running jobs, a reset epoch.
 */
const g = ((globalThis as unknown as Record<symbol, unknown>)[Symbol.for("mecena.deep-research")] ??= {
  queue: Promise.resolve() as Promise<unknown>,
  jobs: new Map<string, Promise<DeepResearchState | undefined>>(),
  epoch: 0,
}) as { queue: Promise<unknown>; jobs: Map<string, Promise<DeepResearchState | undefined>>; epoch: number };

/** Run `fn` alone: reads and writes of both files never interleave (caps, ownership and resets stay consistent). */
function serial<T>(fn: () => T): Promise<T> {
  const run = g.queue.then(fn);
  g.queue = run.catch(() => undefined);
  return run;
}

/** Profile data the search depends on: a change here invalidates the cache. */
export function researchSignature(p: Profile): string {
  const basis = [p.kind, p.disciplines, p.sector, p.territory, p.region, p.birthYear, p.statement, p.projectIdea, p.fundingNeeds];
  return createHash("sha1").update(JSON.stringify(basis)).digest("hex").slice(0, 16);
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

// ---------- validation: candidate → Call ----------

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

/** A real calendar day in YYYY-MM-DD ("2026-11-31" is not). */
const isRealDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** Same page, however it is written: no scheme, no "www.", no trailing slash, no fragment, lower-case host. */
function urlKey(u: string): string {
  try {
    const x = new URL(u.trim());
    return `${x.hostname.replace(/^www\./, "").toLowerCase()}${x.pathname.replace(/\/+$/, "")}${x.search}`;
  } catch {
    return u.trim().toLowerCase();
  }
}

/**
 * Candidates → valid Calls. Drops: no http(s) URL, a URL whose site never came up in the search (likely invented),
 * a past or malformed deadline, a call Mecena already has, and anything the Call schema rejects.
 */
export function candidatesToCalls(
  candidates: DeepResearchCandidate[],
  ctx: { today: string; sourceUrls: string[]; knownUrls?: string[] },
): { calls: Call[]; discarded: number } {
  const seenHosts = new Set(ctx.sourceUrls.map(hostOf).filter(Boolean));
  const known = new Set((ctx.knownUrls ?? []).map(urlKey));
  const calls: Call[] = [];
  const ids = new Set<string>();
  let discarded = 0;
  for (const c of candidates) {
    const url = c.url.trim();
    const host = /^https?:\/\//i.test(url) ? hostOf(url) : undefined;
    const deadlineOk = c.deadline === null || (isRealDate(c.deadline) && c.deadline >= ctx.today);
    if (!host || !seenHosts.has(host) || !deadlineOk || known.has(urlKey(url))) {
      discarded++;
      continue;
    }
    const id = `web-${createHash("sha1").update(urlKey(url)).digest("hex").slice(0, 12)}`;
    if (ids.has(id)) {
      discarded++;
      continue;
    }
    const parsed = Call.safeParse({
      id,
      title: c.title.trim(),
      organizer: c.organizer.trim() || host,
      type: c.type,
      scope: "privado",
      ...(c.region ? { region: c.region } : {}),
      beneficiaryKinds: c.beneficiaryKinds.length ? c.beneficiaryKinds : ["creator"],
      disciplines: normalizeDiscipline(c.disciplines).ids,
      sectors: [],
      eligibility: { residence: c.region ? [c.region] : [], legalForms: [], other: c.requirements.slice(0, 5) },
      amountEur: {},
      amountText: c.amountText.trim() || "Consultar bases",
      deadline: c.deadline,
      deadlineText: c.deadlineText.trim() || "Consultar bases",
      status: "open",
      summary: c.summary.trim(),
      requiredDocuments: [],
      criteria: [],
      criteriaSource: "estimated",
      allowedExpenses: [],
      sourceUrl: url,
      source: "web",
      verifiedAt: ctx.today, // the day it was found, not verified by a person: the UI says "Sin verificar"
    });
    if (!parsed.success || !parsed.data.title) {
      discarded++;
      continue;
    }
    ids.add(id);
    calls.push(withCanonicalCallFields(parsed.data));
  }
  return { calls, discarded };
}

// ---------- public API (ids resolved by the caller) ----------

export interface ResearchIds {
  profileId: string;
  appUserId: string;
  /**
   * The account. The monthly per-user cap counts by it, so "Empezar de cero" (new profile and new appUserId) never
   * refills it. Routes always pass it; without it (older callers) the cap counts by appUserId.
   */
  userId?: string;
}

export type DeepResearchView = {
  status: "idle" | "running" | "done" | "failed" | "limited";
  startedAt?: string;
  finishedAt?: string;
  results: { call: Call; match: MatchResult }[];
  discarded: number;
  runsLeft: number;
  /** Until when a new search for the same profile data returns the cached one. */
  freshUntil?: string;
  message?: string;
};

function runsLeft(usage: UsageEntry[], ids: ResearchIds, now: number): number {
  const month = usage.filter((u) => now - Date.parse(u.at) < MONTH_MS);
  const profile = month.filter((u) => u.profileId === ids.profileId).length;
  const user = month.filter((u) => (ids.userId && u.userId ? u.userId === ids.userId : u.appUserId === ids.appUserId)).length;
  const day = usage.filter((u) => now - Date.parse(u.at) < DAY_MS).length;
  return Math.max(
    0,
    Math.min(DEEP_RESEARCH_LIMITS.runsPerProfilePerMonth - profile, DEEP_RESEARCH_LIMITS.runsPerUserPerMonth - user, DEEP_RESEARCH_LIMITS.runsPerDayOverall - day),
  );
}

/** A "running" state with no job in this process (restart) or past the time limit: report it as interrupted. */
function settled(s: DeepResearchState | undefined, now = Date.now()): DeepResearchState | undefined {
  if (s?.status !== "running") return s;
  const stale = !g.jobs.has(s.profileId) || now - Date.parse(s.startedAt) > DEEP_RESEARCH_LIMITS.staleRunMinutes * 60e3;
  return stale ? { ...s, status: "failed", error: "interrupted" } : s;
}

/** The caller's own state. Another user's deep research is not found, whether reading or starting one. */
function ownState(all: Record<string, DeepResearchState>, ids: ResearchIds): DeepResearchState | undefined {
  const s = all[ids.profileId];
  if (s && s.appUserId !== ids.appUserId) throw new NotFoundError("research");
  return settled(s);
}

const freshUntil = (s: DeepResearchState) => new Date(Date.parse(s.finishedAt ?? s.startedAt) + DEEP_RESEARCH_LIMITS.cacheDays * DAY_MS).toISOString();

/**
 * Forget the deep research of these profiles, or of every profile without ids (demo resets). The usage ledger stays,
 * so a reset never refills the caps, and a run still in flight for a forgotten profile drops its result.
 */
export function forgetDeepResearch(profileIds?: readonly string[]): Promise<void> {
  return serial(() => {
    if (!profileIds) {
      g.epoch++;
      fs.rmSync(stateFile(), { force: true });
      return;
    }
    writeFile(stateFile(), Object.fromEntries(Object.entries(readAll()).filter(([id]) => !profileIds.includes(id))));
  });
}

/** Account deletion only: drop the ledger entries of that account (its user id, profiles or app user ids). */
export function forgetDeepResearchUsage(owner: { userId: string; profileIds: readonly string[]; appUserIds: readonly string[] }): Promise<void> {
  return serial(() => {
    const usage = readUsage();
    const keep = usage.filter((u) => u.userId !== owner.userId && !owner.profileIds.includes(u.profileId) && !owner.appUserIds.includes(u.appUserId));
    if (keep.length !== usage.length) writeFile(usageFile(), keep);
  });
}

function view(ids: ResearchIds, state: DeepResearchState | undefined, extra: Partial<DeepResearchView> = {}): DeepResearchView {
  const left = runsLeft(readUsage(), ids, Date.now());
  if (!state) return { status: "idle", results: [], discarded: 0, runsLeft: left, ...extra };
  const profile = getProfile(ids.profileId);
  const ctx = { hasDossier: Boolean(getDossier(profile.id)), worksCount: listWorks(profile.id).length };
  // The rules decide, as for any call: eligibility and score for the profile as it is now.
  const results = state.calls
    .map((call) => ({ call, r: evaluate(profile, call, ctx) }))
    .filter(({ r }) => !r.excluded && r.match.eligible)
    .sort((a, b) => b.r.match.score - a.r.match.score)
    .map(({ call, r }) => ({ call, match: r.match }));
  const failedMessage = state.error === "interrupted" ? "La búsqueda ampliada se interrumpió. Puedes lanzarla de nuevo." : "La búsqueda ampliada falló. Inténtalo de nuevo más tarde.";
  return {
    status: state.status,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    results,
    discarded: state.discarded,
    runsLeft: left,
    ...(state.status === "done" ? { freshUntil: freshUntil(state) } : {}),
    ...(state.status === "failed" ? { message: failedMessage } : {}),
    ...extra,
  };
}

async function requirePro(appUserId: string) {
  if (!(await resolveEntitlement(appUserId)).pro) throw new PaymentRequiredError("La búsqueda ampliada es una función de Mecena Pro");
}

/** GET: the owner's last deep research for this profile (Pro only). */
export async function getDeepResearch(ids: ResearchIds): Promise<DeepResearchView> {
  await requirePro(ids.appUserId);
  getProfile(ids.profileId); // 404 for an unknown profile
  return view(ids, ownState(readAll(), ids));
}

type Reservation =
  | { kind: "running"; state: DeepResearchState }
  | { kind: "fresh"; state: DeepResearchState }
  | { kind: "limited"; state?: DeepResearchState }
  | { kind: "start"; state: DeepResearchState; epoch: number };

/**
 * POST: start a deep research for this profile in the background (Pro only). Reuses a finished run for the same
 * profile data younger than a week, never runs two at once for a profile, and enforces the caps (per profile and
 * per user a month, everyone a day). The decision and the reservation happen in one serialised step, so concurrent
 * POSTs cannot slip past the caps. `job` lets tests await the background run; routes ignore it.
 */
export async function startDeepResearch(ids: ResearchIds): Promise<{ view: DeepResearchView; job?: Promise<DeepResearchState | undefined> }> {
  await requirePro(ids.appUserId);
  const profile = getProfile(ids.profileId);
  const signature = researchSignature(profile);

  const r: Reservation = await serial((): Reservation => {
    const now = Date.now();
    const prev = ownState(readAll(), ids);
    if (prev?.status === "running") return { kind: "running", state: prev };
    if (prev?.status === "done" && prev.signature === signature && now < Date.parse(freshUntil(prev))) return { kind: "fresh", state: prev };
    const usage = readUsage();
    if (runsLeft(usage, ids, now) <= 0) return { kind: "limited", state: prev };
    const startedAt = new Date(now).toISOString();
    const state: DeepResearchState = {
      profileId: ids.profileId,
      appUserId: ids.appUserId,
      signature,
      status: "running",
      startedAt,
      calls: prev?.calls ?? [],
      discarded: 0,
      searches: 0,
      tokens: 0,
    };
    // keep a year of ledger: enough for the caps, bounded in size
    writeFile(usageFile(), [...usage.filter((u) => now - Date.parse(u.at) < 365 * DAY_MS), { profileId: ids.profileId, appUserId: ids.appUserId, ...(ids.userId ? { userId: ids.userId } : {}), at: startedAt }]);
    writeFile(stateFile(), { ...readAll(), [ids.profileId]: state });
    return { kind: "start", state, epoch: g.epoch };
  });

  if (r.kind === "running") return { view: view(ids, r.state), job: g.jobs.get(ids.profileId) };
  if (r.kind === "fresh") {
    const until = new Date(freshUntil(r.state)).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
    return { view: view(ids, r.state, { message: `Ya buscamos para tu perfil hace poco. Podrás repetirlo a partir del ${until} o cuando cambies tu perfil.` }) };
  }
  if (r.kind === "limited") return { view: view(ids, r.state, { status: "limited", message: "Has usado todas las búsquedas ampliadas disponibles por ahora." }) };

  const job: Promise<DeepResearchState | undefined> = runJob(ids, profile, r.state, r.epoch).finally(() => {
    if (g.jobs.get(ids.profileId) === job) g.jobs.delete(ids.profileId);
  });
  g.jobs.set(ids.profileId, job);
  return { view: view(ids, r.state), job };
}

/** Save the run's outcome only if it is still this run (same owner and start, no demo reset in between). */
function finish(next: DeepResearchState, epoch: number): Promise<DeepResearchState | undefined> {
  return serial(() => {
    const cur = readAll()[next.profileId];
    if (g.epoch !== epoch || !cur || cur.appUserId !== next.appUserId || cur.startedAt !== next.startedAt) return undefined;
    writeFile(stateFile(), { ...readAll(), [next.profileId]: next });
    return next;
  });
}

async function runJob(ids: ResearchIds, profile: Profile, running: DeepResearchState, epoch: number): Promise<DeepResearchState | undefined> {
  const day = today();
  try {
    const r = await getAi().deepResearch({
      profile,
      today: day,
      maxSearches: DEEP_RESEARCH_LIMITS.maxSearches,
      maxOutputTokens: DEEP_RESEARCH_LIMITS.maxOutputTokens,
      maxTotalTokens: DEEP_RESEARCH_LIMITS.maxTotalTokens,
    });
    const knownUrls = listCalls().flatMap((c) => [c.sourceUrl, ...(c.basesUrl ? [c.basesUrl] : [])]);
    const { calls, discarded } = candidatesToCalls(r.candidates, { today: day, sourceUrls: r.sourceUrls, knownUrls });
    return await finish(
      {
        ...running,
        status: "done",
        finishedAt: new Date().toISOString(),
        calls: calls.slice(0, DEEP_RESEARCH_LIMITS.maxResults),
        discarded: discarded + Math.max(0, calls.length - DEEP_RESEARCH_LIMITS.maxResults),
        searches: r.searches,
        tokens: r.inputTokens + r.outputTokens,
      },
      epoch,
    );
  } catch (e) {
    console.warn("[deep-research] run failed:", e instanceof Error ? e.message : e);
    return finish({ ...running, status: "failed", finishedAt: new Date().toISOString(), error: e instanceof Error ? e.message.slice(0, 200) : String(e) }, epoch);
  }
}
