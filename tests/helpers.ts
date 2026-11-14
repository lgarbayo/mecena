/** Test helpers (scaffold-owned). Import from "../helpers". */
import { DEMO_APP_USER_ID, DEMO_BUSINESS_ID, DEMO_CREATOR_ID, fixtureCreator, fixtureTranscript, fixtureWorks } from "@/fixtures";
import { getProfile, readDb, saveEntitlement, saveProfile, saveWork, updateDb, nowIso } from "@/server/store";
import { createSession, createUser as createAccount, SESSION_COOKIE, toolContextFor } from "@/server/auth";
import { z } from "zod";
import type { ProfileKind, ToolContext, User } from "@/contracts";
import { llmTurnSchema, type LlmTurn } from "@/features/onboarding/prompt";

export const DEMO_EMAIL = "demo@mecena.test";
export const TEST_PASSWORD = "una-contraseña-larga";

// ---------- sessions ----------
let currentCookie: string | undefined;

/** Cookie header attached by req() when it is not given explicitly. Reset before every test (tests/setup.ts). */
export function useSession(cookie: string | undefined) {
  currentCookie = cookie;
}

export const sessionCookie = (token: string) => `${SESSION_COOKIE}=${token}`;

/** A new account (with its own blank creator profile) and a cookie header for it. Does not change req()'s default. */
export async function createUser(email: string, password = TEST_PASSWORD): Promise<{ user: User; cookie: string }> {
  const user = await createAccount({ email, password });
  return { user, cookie: await loginAs(user) };
}

/** A fresh session for an existing user: the cookie header to attach to Requests. */
export async function loginAs(user: User | string): Promise<string> {
  const id = typeof user === "string" ? user : user.id;
  return sessionCookie(await createSession(id));
}

/**
 * The account most tests run as: owns the two fixture profiles (demo-creator active, demo-business) and has the
 * fixture RevenueCat id, so tests written for the single-user demo keep their ids. Makes req() send its cookie.
 */
export async function loginDemo(): Promise<{ user: User; cookie: string; ctx: ToolContext }> {
  let user = readDb().users.find((u) => u.email === DEMO_EMAIL);
  if (!user) user = await createAccount({ email: DEMO_EMAIL, password: TEST_PASSWORD });
  const id = user.id;
  user = await updateDb((db) => {
    const u = db.users.find((x) => x.id === id)!;
    db.profiles = db.profiles.filter((p) => !(p.ownerId === id && p.id !== DEMO_CREATOR_ID && p.id !== DEMO_BUSINESS_ID)); // drop the blank signup profile
    for (const p of db.profiles) if (p.id === DEMO_CREATOR_ID || p.id === DEMO_BUSINESS_ID) p.ownerId = id;
    u.activeProfileId = DEMO_CREATOR_ID;
    u.appUserId = DEMO_APP_USER_ID;
    return { ...u };
  });
  const cookie = await loginAs(user);
  useSession(cookie);
  return { user, cookie, ctx: await toolContextFor(user, "app") };
}

/** Tool context of the demo account (logs it in first). */
export async function demoToolCtx(caller: ToolContext["caller"] = "app"): Promise<ToolContext> {
  return { ...(await loginDemo()).ctx, caller };
}

// ---------- seeds ----------
/** Creator already onboarded: profile + transcript + 2 works (what the demo looks like after beat 2). saveProfile keeps the owner. */
export async function seedOnboardedCreator() {
  await saveProfile(structuredClone(fixtureCreator));
  await updateDb((db) => {
    db.transcripts = [...db.transcripts.filter((t) => t.profileId !== DEMO_CREATOR_ID), { profileId: DEMO_CREATOR_ID, segments: structuredClone(fixtureTranscript) }];
  });
  for (const w of fixtureWorks) await saveWork(structuredClone(w));
  return getProfile(DEMO_CREATOR_ID);
}

export async function grantPro(appUserId = DEMO_APP_USER_ID) {
  return saveEntitlement({ appUserId, pro: true, premiumCredits: 0, source: "mock", updatedAt: nowIso() });
}

/**
 * Build a Request for calling a route handler directly. Sends the current session cookie (see useSession/loginDemo);
 * `cookie` overrides it, `cookie: null` sends none.
 */
export function req(url: string, init?: { method?: string; body?: unknown; cookie?: string | null; headers?: Record<string, string> }) {
  const cookie = init?.cookie === undefined ? currentCookie : (init.cookie ?? undefined);
  return new Request(`http://localhost:3000${url}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...init?.headers },
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
