/**
 * Live BDNS catalogue (step 2 of personalised calls).
 *
 * Two kinds of state, kept apart on purpose (multi-user safe):
 * - SHARED, PUBLIC: <MECENA_DATA_DIR>/calls/bdns-live.json — BDNS calls already structured (Call[]), so the same call is
 *   never downloaded or structured by Claude twice. It holds public call data only: no query, no profile, no user.
 *   `listCalls()` merges it after the curated seed (seed wins on id clashes). Its `.meta.json` sibling keeps the last
 *   daily refresh and the BDNS codes Claude could not structure (public codes, retried after a week).
 * - PER PROFILE: <MECENA_DATA_DIR>/profile-searches.json, keyed by profile id and stamped with its owner `appUserId`:
 *   which BDNS searches were run for that profile and which calls they found. Readers must pass the owner.
 *
 * Every function here receives `profileId` / `appUserId` already resolved by its caller (session/route) and never
 * reads the global active profile. Network, BDNS or Claude failures are logged and swallowed: the feed keeps working
 * on whatever the catalogue already has.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Call, type AiService, type Profile } from "@/contracts";
import { bdnsToCallPatch, ccaaOf, disciplineLabel, isDisciplineId, normalizeDiscipline } from "@/features/normalize";
import { isMockAi } from "@/server/ai/llm";
import { dataDir, getProfile, liveCallsFile, listCalls } from "@/server/store";
import regionesJson from "../../../data/taxonomy/bdns/regiones.json";
import { createBdnsClient, DEFAULT_QUERIES, detailToCall, isApplicable, isOpenish, isRelevantRegion, type BdnsDetail, type BdnsQuery } from "./ingest";

// ---------- config ----------

/**
 * Live BDNS searches and the daily refresh run when Claude is available (with the mock structurer they would fill
 * the shared catalogue for good with placeholder data). MECENA_CALLS_LIVE=0 turns them off (tests set it),
 * MECENA_CALLS_LIVE=1 forces them on even in mock mode (local development).
 */
export function liveCatalogEnabled(): boolean {
  const flag = process.env.MECENA_CALLS_LIVE;
  if (flag === "0") return false;
  return flag === "1" || !isMockAi();
}

/**
 * Process-wide state. Next bundles instrumentation and each route separately, so plain module-level maps would exist
 * once per bundle: keep them on globalThis so locks, in-flight structurings and debounce timers are really shared.
 */
function shared<T>(name: string, init: () => T): T {
  const g = globalThis as unknown as Record<symbol, T | undefined>;
  const key = Symbol.for(`mecena.calls-live.${name}`);
  return (g[key] ??= init());
}

/** Claude structurings allowed per run: the AI runs on the owner's key, so every run has a hard cap. */
export const MAX_NEW_PER_PROFILE_SEARCH = 12;
export const MAX_NEW_PER_REFRESH = 40;
/** Queries per daily refresh (defaults + the distinct query sets of known profiles). */
export const MAX_REFRESH_QUERIES = 30;
/** A profile's searches are re-run at most this often when its search signature did not change. */
export const PROFILE_SEARCH_TTL_MS = 24 * 3600e3;
/** Onboarding saves the profile on every turn: wait for it to settle before searching. */
export const PROFILE_SEARCH_DEBOUNCE_MS = 20_000;
/** Claude structurings per day across every run in this process family (hard ceiling on the owner's AI spend). */
export const MAX_STRUCTURED_PER_DAY = 100;
/** A BDNS code Claude could not structure is retried after this long. */
const FAILED_RETRY_MS = 7 * 24 * 3600e3;
/** A code pruned as expired is not structured again for this long (it may still show up in BDNS searches). */
const EXPIRED_RETRY_MS = 60 * 24 * 3600e3;
/** A failed profile search is not retried before this (BDNS down: do not hammer it on every feed load). */
const FAILED_SEARCH_COOLDOWN_MS = 3600e3;
/** Profile searches the daily refresh still repeats, and how long a profile's search state is kept at all. */
const REFRESH_PROFILE_SEARCHES_FOR_MS = 30 * 24 * 3600e3;
const FORGET_PROFILE_SEARCH_AFTER_MS = 90 * 24 * 3600e3;

const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();

// ---------- files ----------

const metaFile = () => liveCallsFile().replace(/\.json$/, ".meta.json");
const rawDir = () => path.join(path.dirname(liveCallsFile()), "raw");
const profileSearchFile = () => path.join(dataDir(), "profile-searches.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback;
  } catch (e) {
    console.warn(`[calls-live] unreadable ${path.basename(file)}, starting empty:`, e instanceof Error ? e.message : e);
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/** One writer at a time per file in this process (read-modify-write always re-reads inside the lock). */
const locks = shared("locks", () => new Map<string, Promise<unknown>>());
function withLock<T>(file: string, fn: () => T | Promise<T>): Promise<T> {
  const run = (locks.get(file) ?? Promise.resolve()).then(fn);
  locks.set(
    file,
    run.catch(() => undefined),
  );
  return run;
}

// ---------- shared catalogue (public data only) ----------

const CatalogMeta = z.object({
  refreshedAt: z.string().optional(),
  failed: z.record(z.string(), z.string()).default({}), // BDNS code → day Claude could not structure it
  expired: z.record(z.string(), z.string()).default({}), // BDNS code → day it was pruned as expired
  spend: z.object({ day: z.string(), structured: z.number().int() }).optional(), // Claude structurings today
});
type CatalogMeta = z.infer<typeof CatalogMeta>;

/** Calls in the shared live catalogue (valid ones only). */
export function readCatalog(): Call[] {
  return readJson<unknown[]>(liveCallsFile(), []).flatMap((x) => {
    const r = Call.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

function readMeta(): CatalogMeta {
  const r = CatalogMeta.safeParse(readJson<unknown>(metaFile(), {}));
  return r.success ? r.data : { failed: {}, expired: {} };
}

export function catalogRefreshedAt(): string | undefined {
  return readMeta().refreshedAt;
}

// ---------- queries derived from a profile ----------

interface RegionNode {
  descripcion: string;
  id: number;
  children?: RegionNode[];
}
const regionIdByNuts = new Map<string, string>();
(function walk(items: RegionNode[]) {
  for (const n of items) {
    regionIdByNuts.set(n.descripcion.split(" - ")[0].trim(), String(n.id));
    walk(n.children ?? []);
  }
})((regionesJson as { items: RegionNode[] }).items);

/** BDNS `regiones` id for a NUTS code (ES11 → "3"), or undefined. */
export function bdnsRegionId(nuts: string): string | undefined {
  return regionIdByNuts.get(nuts);
}

/** BDNS finalidad ids (data/calls/SOURCES.md): 11 cultura, 14 comercio/turismo/pymes. */
const FINALIDAD = { cultura: "11", pymes: "14" } as const;

export interface ProfileQueries {
  queries: BdnsQuery[];
  /** NUTS prefixes whose regional calls are relevant to this profile (besides state-wide ones). */
  regions: string[];
  /** Stable hash of queries + regions: a profile update that does not change it does not search again. */
  signature: string;
}

/** Search terms for the profile's disciplines (creators) or sector (businesses), at most 3. */
function searchTerms(profile: Profile): string[] {
  const ids = normalizeDiscipline(profile.disciplines).ids;
  const fromDisciplines = ids.map((id) => (isDisciplineId(id) ? disciplineLabel(id) : id));
  const fromSector =
    profile.kind === "business" && profile.sector
      ? profile.sector
          .split(/[\/,;·|]| y /)
          .map((s) => s.trim())
          .filter((s) => s.length >= 4)
      : [];
  const seen = new Set<string>();
  return [...fromDisciplines, ...fromSector, ...profile.disciplines]
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 4 && !seen.has(t) && seen.add(t))
    .slice(0, 3);
}

/**
 * BDNS searches for a profile: disciplines / sector → `descripcion`, region → `regiones`, kind → `finalidad`.
 * Deterministic (same profile data → same signature).
 */
export function profileQueries(profile: Profile): ProfileQueries {
  const ccaa = profile.territory ? ccaaOf(profile.territory) : undefined;
  const regionId = ccaa ? bdnsRegionId(ccaa) : undefined;
  const cultural = profile.kind === "creator" || normalizeDiscipline([profile.sector ?? "", ...profile.disciplines]).ids.length > 0;
  const finalidades = profile.kind === "business" ? [FINALIDAD.pymes, ...(cultural ? [FINALIDAD.cultura] : [])] : [FINALIDAD.cultura];

  const queries: BdnsQuery[] = [];
  for (const f of finalidades) queries.push(regionId ? { finalidad: f, regiones: regionId } : { finalidad: f, regiones: "1" });
  for (const term of searchTerms(profile)) queries.push({ descripcion: term });
  const regions = ccaa ? [ccaa] : [];
  const signature = createHash("sha1").update(JSON.stringify({ queries, regions })).digest("hex").slice(0, 16);
  return { queries, regions, signature };
}

// ---------- ingest into the shared catalogue ----------

export interface CatalogIngestOptions {
  queries: { query: BdnsQuery; regions: string[] }[];
  /** BDNS codes already chosen by the caller (the national sweep filtered them by title): no search is run for these. */
  candidates?: { code: string; regions: string[] }[];
  /** Free check on the full record before Claude: a string is the reason to skip it. */
  accept?: (d: BdnsDetail) => string | null;
  /** Do everything except ask Claude and write the catalogue: reports what would be structured. */
  dryRun?: boolean;
  ai: Pick<AiService, "structureCall">;
  maxNew: number;
  fetchImpl?: typeof fetch;
  apiBase?: string;
  delayMs?: number;
  today?: string;
  /** dd/mm/yyyy, default 90 days before `today`. */
  since?: string;
  log?: (msg: string) => void;
}

export interface CatalogIngestResult {
  ok: boolean;
  /** Ids of every applicable, open, relevant call the searches found (already cached, curated or new). */
  found: string[];
  /** How many calls Claude structured in this run (the AI spend). */
  structured: number;
  /** Dry run only: the BDNS codes that passed every free filter and would be sent to Claude. */
  wouldStructure?: string[];
  skipped: { bdnsId: string; reason: string }[];
  error?: string;
}

/** BDNS codes being structured right now in this process: two runs finding the same new call pay Claude once. */
const inflight = shared("inflight", () => new Map<string, Promise<Call | null>>());

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Run BDNS searches and add the new calls to the shared catalogue. A call already known (live catalogue, curated seed
 * or the CLI cache) is never fetched again nor sent to Claude. Never throws.
 */
export async function ingestIntoCatalog(opts: CatalogIngestOptions): Promise<CatalogIngestResult> {
  const log = opts.log ?? (() => {});
  const day = opts.today ?? today();
  const since = opts.since ?? ddmmyyyy(new Date(Date.parse(day) - 90 * 864e5).toISOString().slice(0, 10));
  // Raw records older than a week are downloaded again: a call that was closed or upcoming may be open now.
  const client = createBdnsClient({ fetchImpl: opts.fetchImpl, apiBase: opts.apiBase, delayMs: opts.delayMs, rawDir: rawDir(), rawMaxAgeMs: 7 * 864e5 });
  const found = new Set<string>();
  const skipped: CatalogIngestResult["skipped"] = [];
  let structured = 0;
  const wouldStructure: string[] = [];

  try {
    // code → the regions that made it relevant (a code found by several queries is relevant if any of them says so)
    const hits = new Map<string, Set<string>>();
    // One failing search does not sink the others; if every search fails, BDNS is down and the run fails.
    let failures = 0;
    let lastError: unknown;
    for (const { query, regions } of opts.queries) {
      let codes: string[];
      try {
        codes = await client.search(query, since);
      } catch (e) {
        failures++;
        lastError = e;
        log(`search ${JSON.stringify(query)} failed: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      log(`search ${JSON.stringify(query)}: ${codes.length}`);
      for (const code of codes) {
        const set = hits.get(code) ?? new Set<string>();
        regions.forEach((r) => set.add(r));
        hits.set(code, set);
      }
    }
    if (opts.queries.length && failures === opts.queries.length) throw lastError;
    for (const { code, regions } of opts.candidates ?? []) {
      const set = hits.get(code) ?? new Set<string>();
      regions.forEach((r) => set.add(r));
      hits.set(code, set);
    }

    // Everything already structured, by BDNS code: curated seed first (it wins), then the CLI cache and the live catalogue.
    const known = new Map<string, Call>();
    for (const c of listCalls()) if (c.bdnsId && !known.has(c.bdnsId)) known.set(c.bdnsId, c);
    const recently = (at: string | undefined, ms: number) => Boolean(at) && Date.parse(day) - Date.parse(at!) < ms;

    for (const [code, regions] of hits) {
      const cached = known.get(code);
      if (cached) {
        // Already structured: no BDNS detail, no Claude. Its own data still decides whether it is current.
        if (!cached.deadline || cached.deadline >= day) found.add(cached.id);
        continue;
      }
      const meta = readMeta(); // re-read: a concurrent run may have just failed or pruned this code
      if (recently(meta.failed[code], FAILED_RETRY_MS)) {
        skipped.push({ bdnsId: code, reason: "no estructurable (reintento en una semana)" });
        continue;
      }
      if (recently(meta.expired[code], EXPIRED_RETRY_MS)) {
        skipped.push({ bdnsId: code, reason: "cerrada (ya caducó en el catálogo)" });
        continue;
      }
      let d;
      try {
        d = await client.detail(code);
      } catch (e) {
        skipped.push({ bdnsId: code, reason: `BDNS: ${e instanceof Error ? e.message.slice(0, 120) : e}` });
        continue;
      }
      if (!isApplicable(d)) {
        skipped.push({ bdnsId: code, reason: "no aplicable (concesión directa / convenio)" });
        continue;
      }
      if (!isRelevantRegion(d, [...regions])) {
        skipped.push({ bdnsId: code, reason: "fuera de la zona del perfil" });
        continue;
      }
      if (!isOpenish(d, day)) {
        skipped.push({ bdnsId: code, reason: "cerrada" });
        continue;
      }
      // The deadline the data standard derives (also from text like "25 días naturales"), before paying Claude.
      const derived = bdnsToCallPatch(d).deadline;
      if (derived && derived < day) {
        skipped.push({ bdnsId: code, reason: "cerrada (plazo estimado vencido)" });
        continue;
      }
      const refused = opts.accept?.(d);
      if (refused) {
        skipped.push({ bdnsId: code, reason: refused });
        continue;
      }
      if (opts.dryRun) {
        wouldStructure.push(code);
        continue;
      }
      if (structured >= opts.maxNew && !inflight.has(code)) {
        skipped.push({ bdnsId: code, reason: "tope de estructuración de esta búsqueda" });
        continue;
      }

      let job = inflight.get(code);
      if (!job) {
        // Another run may have structured it while we were fetching the detail: the catalogue file is the truth.
        const already = readCatalog().find((c) => c.bdnsId === code);
        if (already) {
          found.add(already.id);
          continue;
        }
        if (!(await reserveStructuring(day))) {
          skipped.push({ bdnsId: code, reason: "tope diario de estructuración" });
          continue;
        }
        structured++;
        const detail = d;
        job = detailToCall({ ...detail, codigoBDNS: code }, opts.ai, { apiBase: client.api, today: day })
          .then(async (call) => {
            await addToCatalog(call);
            return call;
          })
          .catch(async (e: unknown) => {
            await markFailed(code, day);
            skipped.push({ bdnsId: code, reason: `no estructurable: ${e instanceof Error ? e.message.slice(0, 120) : e}` });
            return null;
          })
          .finally(() => inflight.delete(code));
        inflight.set(code, job);
      }
      const call = await job;
      if (call) found.add(call.id);
    }
    log(`found ${found.size} calls, structured ${structured} new, skipped ${skipped.length}${opts.dryRun ? `, would structure ${wouldStructure.length}` : ""}`);
    return { ok: true, found: [...found], structured, wouldStructure, skipped };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`BDNS search failed, catalogue untouched: ${error}`);
    return { ok: false, found: [...found], structured, wouldStructure, skipped, error };
  }
}

function addToCatalog(call: Call): Promise<void> {
  const file = liveCallsFile();
  return withLock(file, () => {
    const cur = readCatalog().filter((c) => c.id !== call.id);
    writeJson(file, [...cur, call]);
  });
}

function markFailed(code: string, day: string): Promise<void> {
  const file = metaFile();
  return withLock(file, () => {
    const meta = readMeta();
    writeJson(file, { ...meta, failed: { ...meta.failed, [code]: day } });
  });
}

/** Take one structuring from today's budget; false when it is spent. */
function reserveStructuring(day: string): Promise<boolean> {
  const file = metaFile();
  return withLock(file, () => {
    const meta = readMeta();
    const used = meta.spend?.day === day ? meta.spend.structured : 0;
    if (used >= MAX_STRUCTURED_PER_DAY) return false;
    writeJson(file, { ...meta, spend: { day, structured: used + 1 } });
    return true;
  });
}

/**
 * Drop calls whose deadline passed, and undated ones not seen for 120 days; remember their BDNS codes so a later
 * search does not pay Claude to structure them again. Returns how many were removed.
 */
export async function pruneCatalog(day = today()): Promise<number> {
  const file = liveCallsFile();
  const gone = await withLock(file, () => {
    const cur = readCatalog();
    const stale = Date.parse(day) - 120 * 864e5;
    const keep = cur.filter((c) => (c.deadline ? c.deadline >= day : Date.parse(c.verifiedAt) >= stale));
    if (keep.length !== cur.length) writeJson(file, keep);
    return cur.filter((c) => !keep.includes(c));
  });
  const codes = gone.flatMap((c) => (c.bdnsId ? [c.bdnsId] : []));
  if (codes.length) {
    const mf = metaFile();
    await withLock(mf, () => {
      const meta = readMeta();
      writeJson(mf, { ...meta, expired: { ...meta.expired, ...Object.fromEntries(codes.map((c) => [c, day])) } });
    });
  }
  return gone.length;
}

// ---------- per-profile searches (personal state, keyed by profile id) ----------

export const ProfileSearchState = z.object({
  profileId: z.string(),
  appUserId: z.string(), // owner: only they can read it
  signature: z.string(),
  queries: z.array(z.record(z.string(), z.string())),
  regions: z.array(z.string()),
  status: z.enum(["scheduled", "running", "done", "failed"]),
  requestedAt: z.string(),
  lastRunAt: z.string().optional(),
  callIds: z.array(z.string()).default([]), // what this profile's searches found
  structured: z.number().int().default(0),
  error: z.string().optional(),
});
export type ProfileSearchState = z.infer<typeof ProfileSearchState>;

function readProfileSearches(): Record<string, ProfileSearchState> {
  const raw = readJson<Record<string, unknown>>(profileSearchFile(), {});
  const out: Record<string, ProfileSearchState> = {};
  for (const [k, v] of Object.entries(raw)) {
    const r = ProfileSearchState.safeParse(v);
    if (r.success) out[k] = r.data;
  }
  return out;
}

function saveProfileSearch(state: ProfileSearchState): Promise<void> {
  const file = profileSearchFile();
  return withLock(file, () => writeJson(file, { ...readProfileSearches(), [state.profileId]: state }));
}

/** Forget which searches ran for these profiles (all of them without ids): demo reset. The public catalogue stays. */
export function forgetProfileSearches(profileIds?: readonly string[]): Promise<void> {
  const file = profileSearchFile();
  return withLock(file, () => {
    if (!profileIds) return fs.rmSync(file, { force: true });
    const all = readProfileSearches();
    writeJson(file, Object.fromEntries(Object.entries(all).filter(([id]) => !profileIds.includes(id))));
  });
}

/** The profile's search state, only for its owner. */
export function getProfileSearch(profileId: string, appUserId: string): ProfileSearchState | undefined {
  const s = readProfileSearches()[profileId];
  return s && s.appUserId === appUserId ? s : undefined;
}

export interface ProfileSearchOptions {
  ai: Pick<AiService, "structureCall">;
  fetchImpl?: typeof fetch;
  apiBase?: string;
  delayMs?: number;
  today?: string;
  maxNew?: number;
  log?: (msg: string) => void;
}

/**
 * Run the BDNS searches derived from one profile now and record what they found for that profile. Never throws.
 * A profile whose search state belongs to another user is left alone (undefined).
 */
export async function runProfileSearch(input: { profileId: string; appUserId: string }, opts: ProfileSearchOptions): Promise<ProfileSearchState | undefined> {
  const owner = readProfileSearches()[input.profileId]?.appUserId;
  if (owner && owner !== input.appUserId) return undefined;
  let profile: Profile;
  try {
    profile = getProfile(input.profileId);
  } catch {
    return undefined; // profile deleted meanwhile
  }
  const { queries, regions, signature } = profileQueries(profile);
  const base: ProfileSearchState = {
    profileId: input.profileId,
    appUserId: input.appUserId,
    signature,
    queries,
    regions,
    status: "running",
    requestedAt: nowIso(),
    callIds: [],
    structured: 0,
  };
  await saveProfileSearch(base);
  const r = await ingestIntoCatalog({
    queries: queries.map((query) => ({ query, regions })),
    ai: opts.ai,
    maxNew: opts.maxNew ?? MAX_NEW_PER_PROFILE_SEARCH,
    fetchImpl: opts.fetchImpl,
    apiBase: opts.apiBase,
    delayMs: opts.delayMs,
    today: opts.today,
    log: opts.log,
  });
  const done: ProfileSearchState = {
    ...base,
    status: r.ok ? "done" : "failed",
    lastRunAt: nowIso(),
    callIds: r.found,
    structured: r.structured,
    ...(r.error ? { error: r.error } : {}),
  };
  await saveProfileSearch(done);
  return done;
}

/** Pending debounced searches: the signature they were scheduled for. */
const pending = shared("pending", () => new Map<string, { timer: ReturnType<typeof setTimeout>; signature: string }>());
const running = shared("running", () => new Set<string>());

export type ScheduleOutcome = "scheduled" | "fresh" | "running" | "cooldown" | "not-owner" | "disabled";

/**
 * Called when a profile is completed or updated (and when its feed loads): searches BDNS for it in the background,
 * debounced, unless the same searches already ran in the last 24 h (or failed in the last hour). The debounce only
 * restarts when the profile's searches change, so a feed reloading every few seconds cannot keep postponing it.
 * Returns immediately; never throws. `profileId` and `appUserId` come resolved from the caller.
 */
export function scheduleProfileSearch(
  input: { profileId: string; appUserId: string },
  opts: Partial<ProfileSearchOptions> & { debounceMs?: number; enabled?: boolean } = {},
): ScheduleOutcome {
  try {
    if (!(opts.enabled ?? liveCatalogEnabled())) return "disabled";
    if (running.has(input.profileId)) return "running";
    const profile = getProfile(input.profileId);
    const { signature, queries } = profileQueries(profile);
    if (!queries.length) return "fresh";
    const prev = readProfileSearches()[input.profileId];
    if (prev && prev.appUserId !== input.appUserId) return "not-owner";
    const age = prev?.lastRunAt ? Date.now() - Date.parse(prev.lastRunAt) : Infinity;
    if (prev?.signature === signature && prev.status === "done" && age < PROFILE_SEARCH_TTL_MS) return "fresh";
    if (prev?.signature === signature && prev.status === "failed" && age < FAILED_SEARCH_COOLDOWN_MS) return "cooldown";
    const queued = pending.get(input.profileId);
    if (queued?.signature === signature) return "scheduled"; // keep the timer: same searches, nothing new to wait for

    if (queued) clearTimeout(queued.timer);
    const t = setTimeout(() => {
      pending.delete(input.profileId);
      running.add(input.profileId);
      void (async () => {
        const ai = opts.ai ?? (await import("@/server/ai")).getAi();
        await runProfileSearch(input, { ...opts, ai, log: opts.log ?? ((m) => console.log(`[calls-live] ${input.profileId}: ${m}`)) });
      })()
        .catch((e) => console.warn("[calls-live] profile search failed:", e instanceof Error ? e.message : e))
        .finally(() => running.delete(input.profileId));
    }, opts.debounceMs ?? PROFILE_SEARCH_DEBOUNCE_MS);
    t.unref?.();
    pending.set(input.profileId, { timer: t, signature });
    return "scheduled";
  } catch (e) {
    console.warn("[calls-live] could not schedule a profile search:", e instanceof Error ? e.message : e);
    return "disabled";
  }
}

/** Drop search state of profiles not seen for 90 days (their terms stop being sent to BDNS by the refresh). */
function forgetOldProfileSearches(now: number): Promise<void> {
  const file = profileSearchFile();
  return withLock(file, () => {
    const all = readProfileSearches();
    const keep = Object.fromEntries(Object.entries(all).filter(([, s]) => now - Date.parse(s.lastRunAt ?? s.requestedAt) < FORGET_PROFILE_SEARCH_AFTER_MS));
    if (Object.keys(keep).length !== Object.keys(all).length) writeJson(file, keep);
  });
}

// ---------- daily refresh of the shared catalogue ----------

export interface RefreshResult extends CatalogIngestResult {
  pruned: number;
  queries: number;
}

/**
 * Daily refresh: default searches + the distinct searches of known profiles (capped), new calls structured once
 * (capped), expired calls pruned. Only public call data is written to the shared catalogue.
 */
export async function refreshCatalog(opts: Omit<CatalogIngestOptions, "queries" | "maxNew"> & { maxNew?: number; maxQueries?: number }): Promise<RefreshResult> {
  const day = opts.today ?? today();
  const now = Date.now();
  // Each distinct BDNS search once; a call is relevant if any profile that asked for it is in its region.
  const byQuery = new Map<string, { query: BdnsQuery; regions: Set<string> }>();
  const add = (query: BdnsQuery, regions: string[]) => {
    const key = JSON.stringify(Object.entries(query).sort());
    const cur = byQuery.get(key) ?? { query, regions: new Set<string>() };
    regions.forEach((r) => cur.regions.add(r));
    byQuery.set(key, cur);
  };
  for (const q of DEFAULT_QUERIES) add(q, ["ES11"]); // the curated catalogue's home region (Galicia)
  // Profiles active in the last 30 days, most recent first (they win the query cap); older ones are forgotten.
  const searches = Object.values(readProfileSearches())
    .filter((s) => s.lastRunAt && now - Date.parse(s.lastRunAt) < REFRESH_PROFILE_SEARCHES_FOR_MS)
    .sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""));
  for (const s of searches) for (const q of s.queries) add(q, s.regions);
  await forgetOldProfileSearches(now);
  const queries = [...byQuery.values()].map(({ query, regions }) => ({ query, regions: [...regions] }));
  const capped = queries.slice(0, opts.maxQueries ?? MAX_REFRESH_QUERIES);
  if (capped.length < queries.length) opts.log?.(`refresh: ${queries.length - capped.length} queries over the cap, left for tomorrow`);

  const r = await ingestIntoCatalog({ ...opts, today: day, queries: capped, maxNew: opts.maxNew ?? MAX_NEW_PER_REFRESH });
  const pruned = await pruneCatalog(day).catch(() => 0);
  if (r.ok) {
    const file = metaFile();
    await withLock(file, () => writeJson(file, { ...readMeta(), refreshedAt: nowIso() }));
  }
  return { ...r, pruned, queries: capped.length };
}
