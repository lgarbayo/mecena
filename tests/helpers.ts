/** Test helpers (scaffold-owned). Import from "../helpers". */
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID, fixtureCreator, fixtureTranscript, fixtureWorks } from "@/fixtures";
import { saveEntitlement, saveProfile, saveWork, updateDb, nowIso } from "@/server/store";
import { z } from "zod";
import type { ProfileKind } from "@/contracts";
import { llmTurnSchema, type LlmTurn } from "@/features/onboarding/prompt";

/** Creator already onboarded: profile + transcript + 2 works (what the demo looks like after beat 2). */
export async function seedOnboardedCreator() {
  await saveProfile(structuredClone(fixtureCreator));
  await updateDb((db) => {
    db.transcripts = [{ profileId: DEMO_CREATOR_ID, segments: structuredClone(fixtureTranscript) }];
  });
  for (const w of fixtureWorks) await saveWork(structuredClone(w));
}

export async function grantPro(appUserId = DEMO_APP_USER_ID) {
  return saveEntitlement({ appUserId, pro: true, premiumCredits: 0, source: "mock", updatedAt: nowIso() });
}

/** Build a Request for calling a route handler directly. */
export function req(url: string, init?: { method?: string; body?: unknown }) {
  return new Request(`http://localhost:3000${url}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { "content-type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
}

export const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });

/** Claude's profilePatch when the fragment says nothing: every (required) field with its sentinel ("", [], 0). */
export function nothingSaid(kind: ProfileKind): LlmTurn["profilePatch"] {
  const shape = llmTurnSchema(kind).shape.profilePatch.shape as Record<string, z.ZodType>;
  const empty = (f: z.ZodType) => (f instanceof z.ZodArray ? [] : f instanceof z.ZodNumber ? 0 : "");
  return Object.fromEntries(Object.entries(shape).map(([k, f]) => [k, empty(f)])) as unknown as LlmTurn["profilePatch"];
}
