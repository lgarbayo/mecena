/**
 * Per-profile design state, kept beside the main db in dataDir()/dossier-designs.json so the design
 * agent ships without a contract change (CCR-dossier-style asks to move it onto Dossier).
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Call, Profile } from "@/contracts";
import { dataDir, getCall, getDossier, getProfile, getTranscript, nowIso } from "@/server/store";
import { dossierLookRequests } from "@/features/onboarding/interview";
import { designDossier, mockDesign } from "./ai";
import { DossierDesign, guardDesign, presetDesign } from "./design";
import { isDossierStyle, suggestStyle, type DossierStyle } from "./style";
import { forgetLayouts } from "./layout/store";

const Entry = z.object({
  current: DossierDesign,
  history: z
    .array(
      z.object({
        request: z.string(),
        design: DossierDesign,
        at: z.string(),
        segmentId: z.string().optional(), // interview segment this request came from (a retried turn never applies twice)
      }),
    )
    .default([]),
  start: z.boolean().optional(), // the artist undid back to the starting point: nothing designs by itself again
});
type Entry = z.infer<typeof Entry>;
type Store = Record<string, Entry>;

const file = () => path.join(dataDir(), "dossier-designs.json");

/** Every profile's designs. One entry that no longer validates is dropped alone, never the whole file. */
function read(): Store {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    return {};
  }
  const out: Store = {};
  if (raw && typeof raw === "object") {
    for (const [id, value] of Object.entries(raw)) {
      const entry = Entry.safeParse(value);
      if (entry.success) out[id] = entry.data;
      else console.error(`[dossier] dropping an unreadable saved design for ${id}`);
    }
  }
  return out;
}

/** Re-reads the file and changes one profile only, so a slow design never writes back someone else's stale entry. */
function update(profileId: string, entry: Entry | undefined) {
  const store = read();
  if (entry) store[profileId] = entry;
  else delete store[profileId];
  write(store);
}

/** Design requests of one profile run one after another: each one builds on the design the previous one saved. */
const queues = new Map<string, Promise<unknown>>();
function serially<T>(profileId: string, job: () => Promise<T>): Promise<T> {
  const run = (queues.get(profileId) ?? Promise.resolve()).catch(() => undefined).then(job);
  const tail = run.catch(() => undefined);
  queues.set(profileId, tail);
  tail.then(() => {
    if (queues.get(profileId) === tail) queues.delete(profileId);
  });
  return run;
}

function write(store: Store) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 1));
  fs.renameSync(tmp, file());
}

/** The design the artist has, or the starting point that suits the call (or the profile). */
export function currentDesign(input: { profile: Profile; call?: Call; preset?: string | null }): { design: DossierDesign; saved: boolean } {
  const entry = read()[input.profile.id];
  const saved = entry && !entry.start ? entry.current : undefined;
  if (saved && !isDossierStyle(input.preset)) return { design: saved, saved: true };
  const style: DossierStyle = isDossierStyle(input.preset) ? input.preset : suggestStyle({ call: input.call, profile: input.profile }).style;
  return { design: presetDesign(style, input.profile.kind), saved: false };
}

export interface DesignChange {
  design: DossierDesign;
  adjustments: string[];
  saved: true;
}

/** Asks the design agent for a new look from the artist's words, guards it and saves it. */
export function requestDesign(input: {
  profileId: string;
  callId?: string;
  request: string;
  workColors?: string[];
  preset?: string;
  auto?: boolean;
  segmentId?: string;
}): Promise<DesignChange> {
  const profile = getProfile(input.profileId);
  return serially(profile.id, () => designNow({ ...input, profileId: profile.id }));
}

async function designNow(input: Parameters<typeof requestDesign>[0] & { profileId: string }): Promise<DesignChange> {
  const profile = getProfile(input.profileId);
  const call = input.callId ? getCall(input.callId) : undefined;
  const entry = read()[profile.id];
  const current = entry && !entry.start ? entry.current : currentDesign({ profile, call }).design;
  // The first design comes by itself from the interview; it never replaces one the artist already has,
  // nor brings one back after they undid to the starting point.
  if (input.auto && entry) return { design: current, adjustments: [], saved: true };
  // A retried interview turn: this request is already applied.
  if (input.segmentId && entry?.history.some((h) => h.segmentId === input.segmentId)) return { design: current, adjustments: [], saved: true };
  let next: DossierDesign;
  if (isDossierStyle(input.preset)) {
    next = presetDesign(input.preset, profile.kind, input.workColors?.[0]);
  } else {
    // The first design honours what the artist already said about the look in the interview ("fondo negro"):
    // that is a request, not just mood. Without it, the agent reads the mood of the whole interview.
    const said = input.auto && !input.request.trim() ? interviewLookRequest(profile.id) : "";
    const agentInput = {
      request: input.request.trim() || said,
      current,
      profile,
      call,
      workColors: (input.workColors ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5),
      history: entry?.history.map((h) => h.request) ?? [],
      interview: interviewOf(profile),
    };
    try {
      next = await designDossier(agentInput);
    } catch (e) {
      // The live demo must never stall on the design: fall back to reading the request literally.
      console.error("[dossier] design agent failed, using the literal reading", e);
      next = mockDesign(agentInput);
    }
  }
  const { design, adjustments } = guardDesign(next, { call });
  const label = input.preset ? `Punto de partida: ${input.preset}` : input.auto ? "Primer diseño, a partir de tu entrevista" : input.request;
  // Build on what is saved NOW (an undo may have landed while the agent was thinking).
  const latest = read()[profile.id];
  const before = latest && !latest.start ? latest.history : [];
  const history = [...before, { request: label, design, at: nowIso(), ...(input.segmentId ? { segmentId: input.segmentId } : {}) }].slice(-20);
  update(profile.id, { current: design, history });
  return { design, adjustments, saved: true };
}

/** The look the artist asked for during the interview, as one request ("" when they never said). */
export function interviewLookRequest(profileId: string): string {
  return dossierLookRequests(getTranscript(profileId))
    .map((s) => s.text.replace(/[.\s]+$/, ""))
    .join(". ")
    .slice(-600); // like a typed request; the latest words win
}

export function hasSavedDesign(profileId: string): boolean {
  return !!read()[profileId];
}

/**
 * The PDF (and every other renderer that never opens /dossier) must not fall back to a starting point when
 * the artist already talked: design it from the interview first. Never throws; the caller renders whatever is saved.
 */
export async function ensureDesign(input: { profileId: string; callId?: string; waitMs?: number }): Promise<void> {
  if (hasSavedDesign(input.profileId)) return;
  const profile = getProfile(input.profileId);
  const talked = getTranscript(profile.id).length > 0 || !!getDossier(profile.id)?.sections.length;
  if (!talked) return;
  const job = requestDesign({ profileId: profile.id, callId: input.callId, request: "", auto: true }).catch((e) => {
    console.error("[dossier] could not design the dossier from the interview", e);
  });
  // Never hold the download for long: past the wait the PDF uses the starting point and the design still lands for next time.
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([job, new Promise<void>((r) => (timer = setTimeout(r, input.waitMs ?? ENSURE_WAIT_MS)))]);
  clearTimeout(timer);
}

const ENSURE_WAIT_MS = 20_000;

/** What the artist told Mecena about their work: statement, project and their own words from the interview. */
function interviewOf(profile: Profile): string[] {
  const said = getTranscript(profile.id).map((t) => t.text);
  return [profile.statement, profile.bio, profile.projectIdea ?? "", ...said].filter(Boolean).slice(-40);
}

/** Goes back one step. Returns the design now in place (a starting point when history runs out). */
export function undoDesign(input: { profileId: string; callId?: string }): { design: DossierDesign; saved: boolean } {
  const profile = getProfile(input.profileId);
  const call = input.callId ? getCall(input.callId) : undefined;
  const entry = read()[profile.id];
  if (!entry || entry.start || entry.history.length <= 1) {
    // Back to the starting point, and it stays: neither /dossier nor the PDF designs one by itself again.
    const start = presetDesign(suggestStyle({ call, profile }).style, profile.kind);
    update(profile.id, { current: start, history: [], start: true });
    return { design: start, saved: false };
  }
  const history = entry.history.slice(0, -1);
  const current = history[history.length - 1].design;
  update(profile.id, { current, history });
  return { design: current, saved: true };
}

export function designHistory(profileId: string): string[] {
  return read()[profileId]?.history.map((h) => h.request) ?? [];
}

/** Drops the saved designs of these profiles (a user's demo reset). */
export function forgetDesigns(profileIds: string[]): void {
  forgetLayouts(profileIds); // the free layout came from the same interview
  const store = read();
  let changed = false;
  for (const id of profileIds) if (id in store) (delete store[id], (changed = true));
  if (changed) write(store);
}
