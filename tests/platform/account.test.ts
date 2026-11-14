/** Sign-up limits behind a shared Wi-Fi, "Borrar mi cuenta", and what a demo reset may not refill. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { DELETE as deleteMe, GET as me } from "@/app/api/auth/me/route";
import { GET as researchGet, POST as researchPost } from "@/app/api/calls/research/route";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID, fixtureCreator } from "@/fixtures";
import { resetUserDemo } from "@/features/demo/service";
import { DEEP_RESEARCH_LIMITS } from "@/features/deep-research/service";
import { resolveEntitlement } from "@/features/purchases/server";
import { consumeLimits, IP_RATE_LIMIT, limitKeys } from "@/server/auth/rate-limit";
import { dataDir, exportsDir, readDb, saveEntitlement, saveProfile, updateDb, uploadsDir } from "@/server/store";
import { createUser, grantPro, loginDemo, req, seedOnboardedCreator, TEST_PASSWORD } from "../helpers";

const VENUE = { "x-forwarded-for": "203.0.113.50" };
const signupReq = (email: string, extra: Record<string, unknown> = {}) => req("/api/auth/signup", { body: { email, password: TEST_PASSWORD, ...extra }, cookie: null, headers: VENUE });

describe("sign-up from a venue's shared Wi-Fi", () => {
  it("successful sign-ups do not count against the per-IP limit", async () => {
    // the room has already used all but one attempt of the venue's address
    const probe = limitKeys("signup", req("/api/auth/signup", { headers: VENUE }), "x@x.es")[1];
    for (let i = 0; i < IP_RATE_LIMIT.attempts - 1; i++) consumeLimits([probe]);
    for (const n of [1, 2, 3]) expect((await signup(signupReq(`artista${n}@mecena.test`))).status).toBe(201);
    // a failed one (email taken) does count: the window is now full
    expect((await signup(signupReq("artista1@mecena.test"))).status).toBe(409);
    expect((await signup(signupReq("artista9@mecena.test"))).status).toBe(429);
  });

  it("wrong invite codes count per email from that IP", async () => {
    process.env.MECENA_SIGNUP_CODE = "coruna";
    try {
      for (let i = 0; i < 10; i++) expect((await signup(signupReq("adivina@mecena.test", { code: `mal${i}` }))).status).toBe(403);
      expect((await signup(signupReq("adivina@mecena.test", { code: "coruna" }))).status).toBe(429);
      expect((await signup(signupReq("otra@mecena.test", { code: "coruna" }))).status).toBe(201);
    } finally {
      delete process.env.MECENA_SIGNUP_CODE;
    }
  });
});

describe("DELETE /api/auth/me (Borrar mi cuenta)", () => {
  it("needs an explicit confirmation, as same-site JSON", async () => {
    const { cookie } = await loginDemo();
    expect((await deleteMe(req("/api/auth/me", { method: "DELETE", body: {}, cookie }))).status).toBe(400);
    const cross = await deleteMe(req("/api/auth/me", { method: "DELETE", body: { confirm: true }, cookie, headers: { "sec-fetch-site": "cross-site" } }));
    expect(cross.status).toBe(403);
    expect(readDb().users.some((u) => u.email === "demo@mecena.test")).toBe(true);
  });

  it("deletes the account, its sessions, its data and its photos on disk; other accounts are untouched", async () => {
    const { user, cookie } = await loginDemo();
    await seedOnboardedCreator();
    await grantPro();
    const other = await createUser("otra@mecena.test");
    fs.writeFileSync(path.join(uploadsDir(), "work-1.jpg"), "foto");
    fs.writeFileSync(path.join(uploadsDir(), `dossier-import-${DEMO_CREATOR_ID}.pdf`), "pdf");
    fs.writeFileSync(path.join(exportsDir(), `dossier-${DEMO_CREATOR_ID}.pdf`), "pdf");
    fs.writeFileSync(path.join(uploadsDir(), "work-otra.jpg"), "foto de otra");
    await updateDb((db) => {
      db.variantCache.push({ callId: "c", notes: [], cacheKey: "k1", profileId: DEMO_CREATOR_ID }, { callId: "c", notes: [], cacheKey: "k2", profileId: other.user.activeProfileId });
    });

    const res = await deleteMe(req("/api/auth/me", { method: "DELETE", body: { confirm: true }, cookie }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/mecena_session=;/);

    const db = readDb();
    expect(db.users.map((u) => u.id)).not.toContain(user.id);
    expect(db.sessions.some((s) => s.userId === user.id)).toBe(false);
    expect(db.profiles.some((p) => p.ownerId === user.id)).toBe(false);
    expect(db.works.some((w) => w.profileId === DEMO_CREATOR_ID)).toBe(false);
    expect(db.transcripts.some((t) => t.profileId === DEMO_CREATOR_ID)).toBe(false);
    expect(db.entitlements.some((e) => e.appUserId === DEMO_APP_USER_ID)).toBe(false);
    expect(db.variantCache.map((v) => v.cacheKey)).toEqual(["k2"]);
    expect(fs.existsSync(path.join(uploadsDir(), "work-1.jpg"))).toBe(false);
    expect(fs.existsSync(path.join(uploadsDir(), `dossier-import-${DEMO_CREATOR_ID}.pdf`))).toBe(false);
    expect(fs.existsSync(path.join(exportsDir(), `dossier-${DEMO_CREATOR_ID}.pdf`))).toBe(false);
    // the other account is intact
    expect(fs.existsSync(path.join(uploadsDir(), "work-otra.jpg"))).toBe(true);
    expect(db.users.some((u) => u.id === other.user.id)).toBe(true);
    expect((await me(req("/api/auth/me", { cookie: other.cookie }))).status).toBe(200);
    // the old cookie no longer works
    expect((await me(req("/api/auth/me", { cookie }))).status).toBe(401);
  });
});

describe("'Empezar de cero' does not refill the deep-research caps", () => {
  it("the monthly per-user cap counts by account, across resets (new profile and RevenueCat id)", async () => {
    const { user } = await loginDemo();
    await saveProfile(structuredClone(fixtureCreator));
    // runs used this month by this account, each one before a reset (other profile, other app user id)
    const at = new Date().toISOString();
    const used = Array.from({ length: DEEP_RESEARCH_LIMITS.runsPerUserPerMonth }, (_, i) => ({ profileId: `old-profile-${i}`, appUserId: `old-app-${i}`, userId: user.id, at }));
    fs.writeFileSync(path.join(dataDir(), "deep-research-usage.json"), JSON.stringify(used));

    const reset = await resetUserDemo(user, { scenario: "blank" });
    await grantPro(reset.appUserId);
    const view = await (await researchGet(req("/api/calls/research"))).json();
    expect(view.runsLeft).toBe(0);
    const start = await (await researchPost(req("/api/calls/research", { body: {} }))).json();
    expect(start.status).toBe("limited");
  });

  it("ledger entries written before userId existed still count by app user id", async () => {
    const { user } = await loginDemo();
    await saveProfile(structuredClone(fixtureCreator));
    await grantPro();
    const at = new Date().toISOString();
    const legacy = Array.from({ length: 2 }, (_, i) => ({ profileId: `p${i}`, appUserId: DEMO_APP_USER_ID, at }));
    fs.writeFileSync(path.join(dataDir(), "deep-research-usage.json"), JSON.stringify(legacy));
    const view = await (await researchGet(req("/api/calls/research"))).json();
    expect(view.runsLeft).toBe(Math.min(DEEP_RESEARCH_LIMITS.runsPerProfilePerMonth, DEEP_RESEARCH_LIMITS.runsPerUserPerMonth - 2));
    expect(user.id).toBeTruthy();
  });

  it("the reset drops the user's call-adapted dossier variants (and only theirs)", async () => {
    const { user } = await loginDemo();
    const other = await createUser("otra@mecena.test");
    await updateDb((db) => {
      db.variantCache.push(
        { callId: "c", notes: [], cacheKey: "mine", profileId: DEMO_CREATOR_ID },
        { callId: "c", notes: [], cacheKey: "theirs", profileId: other.user.activeProfileId },
        { callId: "c", notes: [], cacheKey: "legacy" },
      );
    });
    await resetUserDemo(user, { scenario: "blank" });
    expect(readDb().variantCache.map((v) => v.cacheKey).sort()).toEqual(["legacy", "theirs"]);
  });
});

describe("Pro expires", () => {
  it("a stored Pro whose period ended is no longer Pro; one without an end date or still running is", async () => {
    const base = { premiumCredits: 0, source: "revenuecat" as const, updatedAt: new Date().toISOString() };
    await saveEntitlement({ ...base, appUserId: "a-expired", pro: true, expiresAt: new Date(Date.now() - 60_000).toISOString() });
    await saveEntitlement({ ...base, appUserId: "a-running", pro: true, expiresAt: new Date(Date.now() + 864e5).toISOString() });
    await saveEntitlement({ ...base, appUserId: "a-forever", pro: true });
    expect((await resolveEntitlement("a-expired")).pro).toBe(false);
    expect((await resolveEntitlement("a-running")).pro).toBe(true);
    expect((await resolveEntitlement("a-forever")).pro).toBe(true);
  });
});
