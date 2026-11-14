/**
 * JSON-file persistence (scaffold-owned). One file: <MECENA_DATA_DIR>/db.json.
 * Read-through on every call so the MCP server process and the Next app see each other's writes.
 * Writes are serialised in-process and atomic (tmp + rename). Good enough for one machine.
 * Multi-user: every profile has an ownerId (User.id) and everything else hangs from a profile. This module does NOT
 * check ownership; callers resolve the signed-in user first (src/server/auth) and pass explicit, owned ids.
 * Calls are read-only data: data/calls/calls.json (+ data/calls/bdns-cache.json if present), plus the shared
 * runtime BDNS catalogue <MECENA_DATA_DIR>/calls/bdns-live.json (public call data only).
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  Call,
  Db,
  PastAward,
  type Application,
  type Dossier,
  type Invoice,
  type JustificationMemoria,
  type EntitlementState,
  type JuryScore,
  type Profile,
  type ProfilePatch,
  type TranscriptSegment,
  type Work,
  NotFoundError,
  serverEnv,
} from "@/contracts";
import { defaultDb, fixtureCalls } from "@/fixtures";
import { profileBeneficiaryTypes, profileTerritory, withCanonicalCallFields } from "@/features/normalize";
import { CallHistory } from "@/features/history/history";

export const nowIso = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export function dataDir(): string {
  return path.resolve(process.cwd(), serverEnv().dataDir);
}
function dbFile() {
  return path.join(dataDir(), "db.json");
}
export function uploadsDir(): string {
  const d = path.join(dataDir(), "uploads");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export function exportsDir(): string {
  const d = path.join(dataDir(), "exports");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** Initial state: data/demo/seed.json (WP-09, path = MECENA_SEED_FILE) if valid, else fixtures. */
export function initialDb(): Db {
  const seed = path.resolve(process.cwd(), serverEnv().seedFile);
  if (fs.existsSync(seed)) {
    const parsed = Db.safeParse(JSON.parse(fs.readFileSync(seed, "utf8")));
    if (parsed.success) return parsed.data;
    console.warn("[store] data/demo/seed.json is invalid, falling back to fixtures:", parsed.error.issues[0]);
  }
  return defaultDb();
}

/**
 * Read cache: the parsed, validated db.json, keyed by the file's inode, size and mtime (ns). A write from this process
 * or from another one (the MCP server) renames a new file in, so the key changes and the next read parses it again.
 * Callers always get their own deep copy (they may mutate it), never the cached object.
 */
const cache = ((globalThis as unknown as Record<symbol, unknown>)[Symbol.for("mecena.db-cache")] ??= { file: "", key: "", db: undefined, good: false }) as {
  file: string;
  key: string;
  db: Db | undefined;
  /** db.json itself parsed (false: it was damaged and `db` came from the backup). */
  good: boolean;
};

function fileKey(f: string): string | undefined {
  try {
    const st = fs.statSync(f, { bigint: true });
    return `${st.ino}:${st.size}:${st.mtimeNs}`;
  } catch {
    return undefined;
  }
}

function parseDbFile(f: string): Db {
  return Db.parse(JSON.parse(fs.readFileSync(f, "utf8")));
}

/** The previous db.json, kept by every write (see writeDbSync). */
export const backupFile = () => `${dbFile()}.bak`;

export function readDb(): Db {
  const f = dbFile();
  const key = fileKey(f); // stat before reading: a write landing in between only costs one more parse later
  if (!key) {
    const db = initialDb();
    writeDbSync(db);
    return structuredClone(db);
  }
  if (cache.file === f && cache.key === key && cache.db) return structuredClone(cache.db);
  let db: Db;
  let good = true;
  try {
    db = parseDbFile(f);
  } catch (e) {
    // A damaged db.json (disk full, a hand edit) would take the whole app down: serve the last good copy instead. The
    // next write replaces db.json with valid data again.
    if (!fs.existsSync(backupFile())) throw e;
    console.error("[store] db.json is unreadable, serving db.json.bak:", e instanceof Error ? e.message : e);
    db = parseDbFile(backupFile());
    good = false;
  }
  Object.assign(cache, { file: f, key, db, good });
  return structuredClone(db);
}

function writeDbSync(db: Db) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const file = dbFile();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  // Keep the previous version: if db.json is ever damaged, readDb falls back to it. Only a db.json known to parse is
  // copied (updateDb has just read it), so a damaged file never overwrites the good backup.
  if (cache.file === file && cache.good && cache.key === fileKey(file)) {
    try {
      fs.copyFileSync(file, backupFile());
    } catch (e) {
      console.warn("[store] could not back up db.json:", e instanceof Error ? e.message : e);
    }
  }
  fs.renameSync(tmp, file);
  const key = fileKey(file);
  Object.assign(cache, key ? { file, key, db: structuredClone(db), good: true } : { file: "", key: "", db: undefined, good: false });
}

let queue: Promise<unknown> = Promise.resolve();
/** Serialised read-modify-write. The mutator may mutate `db` in place and return a value. */
export function updateDb<T>(mutate: (db: Db) => T): Promise<T> {
  const run = queue.then(() => {
    const db = readDb();
    const result = mutate(db);
    writeDbSync(Db.parse(db));
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Replace the whole DB (admin CLI reset: wipes every user). */
export async function resetDb(db: Db = initialDb()): Promise<Db> {
  return updateDb((cur) => {
    Object.assign(cur, structuredClone(db));
    return cur;
  });
}

// ---------- profiles ----------
/** A profile by id. The id is required: there is no global "active profile" any more (it lives on each User). */
export function getProfile(id: string): Profile {
  const p = readDb().profiles.find((x) => x.id === id);
  if (!p) throw new NotFoundError("profile");
  return p;
}
/** Every profile an account owns. */
export function listProfilesOf(ownerId: string): Profile[] {
  return readDb().profiles.filter((p) => p.ownerId === ownerId);
}

const ARRAY_FIELDS = ["disciplines", "achievements", "education", "links", "fundingNeeds", "languages"] as const;

/** Merge a patch: scalars overwrite when non-empty, arrays are unioned (case-insensitive dedupe). */
export function mergeProfile(p: Profile, patch: ProfilePatch): Profile {
  const next: Profile = { ...p };
  // If the sector changes without an explicit CNAE, clear any previous CNAE so it is re-derived from the new sector.
  if (patch.sector && patch.sector.trim() && patch.sector !== p.sector && !patch.cnae) {
    delete next.cnae;
  }
  // If city changes without explicit province/region, clear stale broader fields so territory resolution stays consistent.
  if (patch.city && patch.city.trim() && patch.city !== p.city) {
    if (!patch.province) delete next.province;
    if (!patch.region) delete next.region;
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "id" || k === "ownerId" || k === "kind") continue; // identity and ownership never change through a patch
    if ((ARRAY_FIELDS as readonly string[]).includes(k) && Array.isArray(v)) {
      const cur = (next as Record<string, unknown>)[k] as string[];
      const seen = new Set(cur.map((s) => s.toLowerCase().trim()));
      (next as Record<string, unknown>)[k] = [...cur, ...v.filter((s) => !seen.has(String(s).toLowerCase().trim()))];
    } else {
      (next as Record<string, unknown>)[k] = v;
    }
  }
  next.updatedAt = nowIso();
  return withCanonicalFields(next);
}

/**
 * CCR-1 / CCR-3: keep the canonical territory and beneficiary types in sync with the display fields
 * (city/province/region, kind/legalForm/size), so matching compares ids instead of free text.
 */
export function withCanonicalFields(p: Profile): Profile {
  const territory = profileTerritory(p).value;
  const next: Profile = { ...p, beneficiaryTypes: profileBeneficiaryTypes(p) };
  if (territory) next.territory = territory;
  else delete next.territory;
  return next;
}

/** The person's own edit: the fields sent replace what is there, and "" or [] clears a field. */
export function replaceProfileFields(p: Profile, patch: ProfilePatch): Profile {
  const next: Record<string, unknown> = { ...p };
  if (patch.city !== undefined && patch.city !== p.city) {
    if (patch.province === undefined) delete next.province;
    if (patch.region === undefined) delete next.region;
  }
  if (patch.sector !== undefined && patch.sector !== p.sector && patch.cnae === undefined) delete next.cnae;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id" || k === "ownerId" || k === "kind" || v === undefined) continue;
    if ((ARRAY_FIELDS as readonly string[]).includes(k)) next[k] = Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
    else if (v === null || (typeof v === "string" && !v.trim())) delete next[k];
    else next[k] = typeof v === "string" ? v.trim() : v;
  }
  if (next.displayName === undefined) next.displayName = "";
  next.updatedAt = nowIso();
  return withCanonicalFields(next as Profile);
}

export function patchProfile(id: string, patch: ProfilePatch, opts: { replace?: boolean } = {}): Promise<Profile> {
  return updateDb((db) => {
    const i = db.profiles.findIndex((x) => x.id === id);
    if (i < 0) throw new NotFoundError("profile");
    db.profiles[i] = opts.replace ? replaceProfileFields(db.profiles[i], patch) : mergeProfile(db.profiles[i], patch);
    return db.profiles[i];
  });
}

/** Insert or replace a profile. Replacing never changes its owner: ownership is set once, when the profile is created. */
export function saveProfile(input: Profile): Promise<Profile> {
  return updateDb((db) => {
    const i = db.profiles.findIndex((x) => x.id === input.id);
    const p = withCanonicalFields(i < 0 ? input : { ...input, ownerId: db.profiles[i].ownerId });
    if (p.ownerId === undefined) delete p.ownerId;
    if (i < 0) db.profiles.push(p);
    else db.profiles[i] = p;
    return p;
  });
}

// ---------- transcripts ----------
export function getTranscript(profileId: string): TranscriptSegment[] {
  return readDb().transcripts.find((t) => t.profileId === profileId)?.segments ?? [];
}
export function appendSegment(profileId: string, text: string, source: "voice" | "text"): Promise<TranscriptSegment> {
  return updateDb((db) => {
    let t = db.transcripts.find((x) => x.profileId === profileId);
    if (!t) {
      t = { profileId, segments: [] };
      db.transcripts.push(t);
    }
    const seg: TranscriptSegment = { id: newId("seg"), text, source, at: nowIso() };
    t.segments.push(seg);
    return seg;
  });
}

// ---------- works ----------
export function listWorks(profileId: string): Work[] {
  return readDb()
    .works.filter((w) => w.profileId === profileId)
    .sort((a, b) => a.order - b.order);
}
export function getWork(id: string): Work {
  const w = readDb().works.find((x) => x.id === id);
  if (!w) throw new NotFoundError("work");
  return w;
}
export function saveWork(w: Work): Promise<Work> {
  return updateDb((db) => {
    const i = db.works.findIndex((x) => x.id === w.id);
    if (i < 0) db.works.push(w);
    else db.works[i] = w;
    return w;
  });
}

// ---------- dossiers ----------
export function getDossier(profileId: string): Dossier | undefined {
  return readDb().dossiers.find((d) => d.profileId === profileId);
}
export function saveDossier(d: Dossier): Promise<Dossier> {
  return updateDb((db) => {
    const i = db.dossiers.findIndex((x) => x.profileId === d.profileId);
    if (i < 0) db.dossiers.push(d);
    else db.dossiers[i] = d;
    return d;
  });
}

// ---------- calls (read-only files, owned by WP-05) ----------
/** <callsDir>/calls.json is the curated seed; bdns-cache.json is the live-ingest cache. Seed wins on id clashes. */
const CALLS_FILES = ["calls.json", "bdns-cache.json"];
export function callsDir(): string {
  return path.resolve(process.cwd(), serverEnv().callsDir);
}
/**
 * Shared BDNS catalogue filled at runtime (src/features/calls-ingest/live.ts): public call data only, on the
 * persistent data dir (the image's data/calls is read-only). Merged after the seed files, so the seed wins.
 */
export function liveCallsFile(): string {
  return path.join(dataDir(), "calls", "bdns-live.json");
}
function readCallsFile(f: string): unknown[] {
  try {
    const raw = JSON.parse(fs.readFileSync(f, "utf8")) as unknown;
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.warn(`[store] unreadable ${path.basename(f)}, skipping it:`, e instanceof Error ? e.message : e);
    return [];
  }
}
/** An "upcoming" call whose opening day (Spain) has come is open: the stored status is only as fresh as its ingest. */
export function withLiveStatus(call: Call, now: Date = new Date()): Call {
  if (call.status !== "upcoming" || !call.opensAt) return call;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now);
  return call.opensAt.slice(0, 10) <= today ? { ...call, status: "open" } : call;
}
export function listCalls(): Call[] {
  const out: Call[] = [];
  const seen = new Set<string>();
  const seenBdns = new Set<string>();
  let anyFile = false;
  const live = liveCallsFile();
  for (const f of [...CALLS_FILES.map((rel) => path.join(callsDir(), rel)), live]) {
    if (!fs.existsSync(f)) continue;
    if (f !== live) anyFile = true;
    const rel = path.basename(f);
    const raw = f === live ? readCallsFile(f) : (JSON.parse(fs.readFileSync(f, "utf8")) as unknown[]);
    for (const item of raw) {
      const parsed = Call.safeParse(item);
      if (!parsed.success) {
        console.warn(`[store] skipping invalid call in ${rel}:`, parsed.error.issues[0]);
        continue;
      }
      // Seed first: a later file never repeats an id, nor a BDNS call the seed already curated under its own slug.
      if (seen.has(parsed.data.id) || (parsed.data.bdnsId && seenBdns.has(parsed.data.bdnsId))) continue;
      seen.add(parsed.data.id);
      if (parsed.data.bdnsId) seenBdns.add(parsed.data.bdnsId);
      out.push(withCanonicalCallFields(withLiveStatus(parsed.data)));
    }
  }
  // Until WP-05 lands data/calls/calls.json the app runs on clearly-labelled fictional fixtures.
  return anyFile ? out : [...structuredClone(fixtureCalls), ...out.filter((c) => !fixtureCalls.some((f) => f.id === c.id))];
}
/** <callsDir>/awards.json (WP-05, optional). */
export function listAwards(): PastAward[] {
  const f = path.join(callsDir(), "awards.json");
  if (!fs.existsSync(f)) return [];
  return (JSON.parse(fs.readFileSync(f, "utf8")) as unknown[]).flatMap((x) => {
    const r = PastAward.safeParse(x);
    return r.success ? [r.data] : [];
  });
}

/** <callsDir>/history.json (B3, optional): past-editions evidence for one call, or undefined. */
export function getCallHistory(callId: string): CallHistory | undefined {
  const f = path.join(callsDir(), "history.json");
  if (!fs.existsSync(f)) return undefined;
  const r = CallHistory.safeParse((JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, unknown>)[callId]);
  return r.success ? r.data : undefined;
}

export function getCall(id: string): Call {
  const c = listCalls().find((x) => x.id === id);
  if (!c) throw new NotFoundError("call");
  return c;
}

// ---------- applications & jury ----------
export function getApplication(id: string): Application {
  const a = readDb().applications.find((x) => x.id === id);
  if (!a) throw new NotFoundError("application");
  return a;
}
export function findApplication(profileId: string, callId: string): Application | undefined {
  return readDb().applications.find((a) => a.profileId === profileId && a.callId === callId);
}
export function saveApplication(a: Application): Promise<Application> {
  return updateDb((db) => {
    const i = db.applications.findIndex((x) => x.id === a.id);
    if (i < 0) db.applications.push(a);
    else db.applications[i] = a;
    return a;
  });
}
export function listJuryScores(applicationId: string): JuryScore[] {
  return readDb().juryScores.filter((s) => s.applicationId === applicationId);
}
export function saveJuryScore(s: JuryScore): Promise<JuryScore> {
  return updateDb((db) => {
    db.juryScores.push(s);
    return s;
  });
}

export function latestJuryScore(applicationId: string): JuryScore | undefined {
  return listJuryScores(applicationId).at(-1);
}

// ---------- justification (invoices + final memoria) ----------
export function listInvoices(applicationId: string): Invoice[] {
  return readDb()
    .invoices.filter((i) => i.applicationId === applicationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function getInvoice(id: string): Invoice {
  const i = readDb().invoices.find((x) => x.id === id);
  if (!i) throw new NotFoundError("invoice");
  return i;
}
export function saveInvoice(i: Invoice): Promise<Invoice> {
  return updateDb((db) => {
    const k = db.invoices.findIndex((x) => x.id === i.id);
    if (k < 0) db.invoices.push(i);
    else db.invoices[k] = i;
    return i;
  });
}
export function deleteInvoice(id: string): Promise<void> {
  return updateDb((db) => {
    db.invoices = db.invoices.filter((x) => x.id !== id);
  });
}
export function getJustification(applicationId: string): JustificationMemoria | undefined {
  return readDb().justifications.find((j) => j.applicationId === applicationId);
}
export function saveJustification(j: JustificationMemoria): Promise<JustificationMemoria> {
  return updateDb((db) => {
    const k = db.justifications.findIndex((x) => x.applicationId === j.applicationId);
    if (k < 0) db.justifications.push(j);
    else db.justifications[k] = j;
    return j;
  });
}

// ---------- entitlements ----------
export function getEntitlement(appUserId: string): EntitlementState {
  return (
    readDb().entitlements.find((e) => e.appUserId === appUserId) ?? {
      appUserId,
      pro: false,
      premiumCredits: 0,
      source: "mock",
      updatedAt: nowIso(),
    }
  );
}
export function saveEntitlement(e: EntitlementState): Promise<EntitlementState> {
  return updateDb((db) => {
    const i = db.entitlements.findIndex((x) => x.appUserId === e.appUserId);
    if (i < 0) db.entitlements.push(e);
    else db.entitlements[i] = e;
    return e;
  });
}
