/**
 * JSON-file persistence (scaffold-owned). One file: <MECENA_DATA_DIR>/db.json.
 * Read-through on every call so the MCP server process and the Next app see each other's writes.
 * Writes are serialised in-process and atomic (tmp + rename). Good enough for one machine.
 * Multi-user: every profile has an ownerId (User.id) and everything else hangs from a profile. This module does NOT
 * check ownership; callers resolve the signed-in user first (src/server/auth) and pass explicit, owned ids.
 * Calls are read-only data: data/calls/calls.json (+ data/calls/bdns-cache.json if present).
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

export function readDb(): Db {
  const f = dbFile();
  if (!fs.existsSync(f)) {
    const db = initialDb();
    writeDbSync(db);
    return db;
  }
  return Db.parse(JSON.parse(fs.readFileSync(f, "utf8")));
}

function writeDbSync(db: Db) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = `${dbFile()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbFile());
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
  if (!p) throw new NotFoundError(`Perfil ${id}`);
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

export function patchProfile(id: string, patch: ProfilePatch): Promise<Profile> {
  return updateDb((db) => {
    const i = db.profiles.findIndex((x) => x.id === id);
    if (i < 0) throw new NotFoundError(`Perfil ${id}`);
    db.profiles[i] = mergeProfile(db.profiles[i], patch);
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
  if (!w) throw new NotFoundError(`Obra ${id}`);
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
export function listCalls(): Call[] {
  const out: Call[] = [];
  const seen = new Set<string>();
  let anyFile = false;
  for (const rel of CALLS_FILES) {
    const f = path.join(callsDir(), rel);
    if (!fs.existsSync(f)) continue;
    anyFile = true;
    const raw = JSON.parse(fs.readFileSync(f, "utf8")) as unknown[];
    for (const item of raw) {
      const parsed = Call.safeParse(item);
      if (!parsed.success) {
        console.warn(`[store] skipping invalid call in ${rel}:`, parsed.error.issues[0]);
        continue;
      }
      if (seen.has(parsed.data.id)) continue;
      seen.add(parsed.data.id);
      out.push(withCanonicalCallFields(parsed.data));
    }
  }
  // Until WP-05 lands data/calls/calls.json the app runs on clearly-labelled fictional fixtures.
  return anyFile ? out : structuredClone(fixtureCalls);
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
  if (!c) throw new NotFoundError(`Convocatoria ${id}`);
  return c;
}

// ---------- applications & jury ----------
export function getApplication(id: string): Application {
  const a = readDb().applications.find((x) => x.id === id);
  if (!a) throw new NotFoundError(`Solicitud ${id}`);
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
