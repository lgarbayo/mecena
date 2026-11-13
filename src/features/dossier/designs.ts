/**
 * Per-profile design state, kept beside the main db in dataDir()/dossier-designs.json so the design
 * agent ships without a contract change (CCR-dossier-style asks to move it onto Dossier).
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Call, Profile } from "@/contracts";
import { dataDir, getCall, getProfile, nowIso } from "@/server/store";
import { designDossier, mockDesign } from "./ai";
import { DossierDesign, guardDesign, presetDesign } from "./design";
import { isDossierStyle, suggestStyle, type DossierStyle } from "./style";

const Entry = z.object({
  current: DossierDesign,
  history: z.array(z.object({ request: z.string(), design: DossierDesign, at: z.string() })).default([]),
});
const Store = z.record(z.string(), Entry);
type Store = z.infer<typeof Store>;

const file = () => path.join(dataDir(), "dossier-designs.json");

function read(): Store {
  try {
    return Store.parse(JSON.parse(fs.readFileSync(file(), "utf8")));
  } catch {
    return {};
  }
}

function write(store: Store) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 1));
  fs.renameSync(tmp, file());
}

/** The design the artist has, or the starting point that suits the call (or the profile). */
export function currentDesign(input: { profile: Profile; call?: Call; preset?: string | null }): { design: DossierDesign; saved: boolean } {
  const saved = read()[input.profile.id]?.current;
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
export async function requestDesign(input: { profileId?: string; callId?: string; request: string; workColors?: string[]; preset?: string }): Promise<DesignChange> {
  const profile = getProfile(input.profileId);
  const call = input.callId ? getCall(input.callId) : undefined;
  const store = read();
  const entry = store[profile.id];
  let next: DossierDesign;
  if (isDossierStyle(input.preset)) {
    next = presetDesign(input.preset, profile.kind, input.workColors?.[0]);
  } else {
    const current = entry?.current ?? currentDesign({ profile, call }).design;
    const agentInput = {
      request: input.request,
      current,
      profile,
      call,
      workColors: (input.workColors ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5),
      history: entry?.history.map((h) => h.request) ?? [],
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
  const history = [...(entry?.history ?? []), { request: input.preset ? `Punto de partida: ${input.preset}` : input.request, design, at: nowIso() }].slice(-20);
  store[profile.id] = { current: design, history };
  write(store);
  return { design, adjustments, saved: true };
}

/** Goes back one step. Returns the design now in place (a starting point when history runs out). */
export function undoDesign(input: { profileId?: string; callId?: string }): { design: DossierDesign; saved: boolean } {
  const profile = getProfile(input.profileId);
  const call = input.callId ? getCall(input.callId) : undefined;
  const store = read();
  const entry = store[profile.id];
  if (!entry || entry.history.length <= 1) {
    delete store[profile.id];
    write(store);
    return currentDesign({ profile, call });
  }
  const history = entry.history.slice(0, -1);
  store[profile.id] = { current: history[history.length - 1].design, history };
  write(store);
  return { design: store[profile.id].current, saved: true };
}

export function designHistory(profileId: string): string[] {
  return read()[profileId]?.history.map((h) => h.request) ?? [];
}
