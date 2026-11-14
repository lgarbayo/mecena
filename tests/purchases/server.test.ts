import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JURY_RUNS_PER_APPLICATION, PaymentRequiredError } from "@/contracts";
import { GET, POST } from "@/app/api/entitlements/route";
import { draftingAi } from "@/features/drafting/ai";
import { draftApplication } from "@/features/drafting/service";
import { requireDraftEntitlement, reserveDraftCredit, resolveEntitlement, syncEntitlement, verificationMode, withJuryRun } from "@/features/purchases/server";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID } from "@/fixtures";
import { getEntitlement, nowIso, readDb, saveEntitlement } from "@/server/store";
import { createUser, grantPro, loginDemo, req, seedOnboardedCreator } from "../helpers";

// Route handlers need a session: run as the demo account (owns the fixture profiles).
beforeEach(async () => {
  await loginDemo();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const buyPremium = (appUserId: string) => syncEntitlement({ appUserId, purchasedProductId: "mecena_solicitud_premium" });

describe("verification mode", () => {
  it("tests run in the explicit mock mode", () => {
    expect(verificationMode()).toBe("mock");
  });

  it("production or a non-mock build without the secret key is disabled; the secret key always means RevenueCat", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(verificationMode()).toBe("disabled");
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_PURCHASES_MOCK", "0");
    expect(verificationMode()).toBe("disabled");
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "sk_test_x");
    expect(verificationMode()).toBe("revenuecat");
  });
});

describe("draft gate", () => {
  it("no plan → PaymentRequiredError", async () => {
    await expect(requireDraftEntitlement("nobody")).rejects.toBeInstanceOf(PaymentRequiredError);
    await expect(reserveDraftCredit("nobody")).rejects.toBeInstanceOf(PaymentRequiredError);
  });

  it("a premium credit allows exactly one new draft, and a refund gives it back once", async () => {
    await buyPremium("u1");
    const r = await reserveDraftCredit("u1");
    expect(r.usedCredit).toBe(true);
    expect(getEntitlement("u1")).toMatchObject({ premiumCredits: 0, premiumUsed: 1 });
    await expect(reserveDraftCredit("u1")).rejects.toBeInstanceOf(PaymentRequiredError);
    await r.refund();
    await r.refund();
    expect(getEntitlement("u1")).toMatchObject({ premiumCredits: 1, premiumUsed: 0 });
  });

  it("two concurrent reservations never share one credit", async () => {
    await buyPremium("u-race");
    const out = await Promise.allSettled([reserveDraftCredit("u-race"), reserveDraftCredit("u-race"), reserveDraftCredit("u-race")]);
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(out.filter((o) => o.status === "rejected" && o.reason instanceof PaymentRequiredError)).toHaveLength(2);
    expect(getEntitlement("u-race").premiumCredits).toBe(0);
  });

  it("Pro allows unlimited drafts and never spends credits", async () => {
    await syncEntitlement({ appUserId: "u2", purchasedProductId: "mecena_pro_monthly" });
    await buyPremium("u2");
    for (let i = 0; i < 3; i++) expect((await reserveDraftCredit("u2")).usedCredit).toBe(false);
    expect(getEntitlement("u2").premiumCredits).toBe(1);
  });

  it("an expired Pro is not Pro (and does not draft)", async () => {
    await saveEntitlement({ appUserId: "u-exp", pro: true, premiumCredits: 0, expiresAt: new Date(Date.now() - 60_000).toISOString(), source: "mock", updatedAt: nowIso() });
    expect((await resolveEntitlement("u-exp")).pro).toBe(false);
    await expect(reserveDraftCredit("u-exp")).rejects.toBeInstanceOf(PaymentRequiredError);
    await saveEntitlement({ appUserId: "u-live", pro: true, premiumCredits: 0, expiresAt: new Date(Date.now() + 864e5).toISOString(), source: "mock", updatedAt: nowIso() });
    expect((await resolveEntitlement("u-live")).pro).toBe(true);
  });
});

describe("draftApplication with one premium credit", () => {
  it("a double tap drafts once and spends one credit", async () => {
    await seedOnboardedCreator();
    await buyPremium(DEMO_APP_USER_ID);
    const spy = vi.spyOn(draftingAi.mock, "draftApplication");
    const input = { callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID };
    const [a, b] = await Promise.all([draftApplication(input, { appUserId: DEMO_APP_USER_ID }), draftApplication(input, { appUserId: DEMO_APP_USER_ID })]);
    expect(a.id).toBe(b.id);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(readDb().applications.filter((x) => x.profileId === DEMO_CREATOR_ID && x.callId === input.callId)).toHaveLength(1);
    expect(getEntitlement(DEMO_APP_USER_ID).premiumCredits).toBe(0);
  });

  it("two different calls at once with one credit: one draft, one 402", async () => {
    await seedOnboardedCreator();
    await buyPremium(DEMO_APP_USER_ID);
    const ctx = { appUserId: DEMO_APP_USER_ID };
    const out = await Promise.allSettled([
      draftApplication({ callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID }, ctx),
      draftApplication({ callId: "fixture-premio-ilustracion", profileId: DEMO_CREATOR_ID }, ctx),
    ]);
    expect(out.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(out.filter((o) => o.status === "rejected" && o.reason instanceof PaymentRequiredError)).toHaveLength(1);
  });

  it("the credit is reserved before the AI and given back when the AI fails", async () => {
    await seedOnboardedCreator();
    await buyPremium(DEMO_APP_USER_ID);
    vi.spyOn(draftingAi.mock, "draftApplication").mockImplementation(async () => {
      expect(getEntitlement(DEMO_APP_USER_ID).premiumCredits).toBe(0); // already reserved while the AI runs
      throw new Error("AI down");
    });
    await expect(draftApplication({ callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID }, { appUserId: DEMO_APP_USER_ID })).rejects.toThrow("AI down");
    expect(getEntitlement(DEMO_APP_USER_ID)).toMatchObject({ premiumCredits: 1, premiumUsed: 0 });
  });
});

describe("simulated jury entitlement", () => {
  it(`without Pro an application includes ${JURY_RUNS_PER_APPLICATION} runs, then 402; another application has its own`, async () => {
    for (let i = 0; i < JURY_RUNS_PER_APPLICATION; i++) await withJuryRun("j1", "app-1", async () => "ok");
    await expect(withJuryRun("j1", "app-1", async () => "ok")).rejects.toBeInstanceOf(PaymentRequiredError);
    await expect(withJuryRun("j1", "app-2", async () => "ok")).resolves.toBe("ok");
  });

  it("a failed run is not counted", async () => {
    await expect(withJuryRun("j2", "app-1", async () => Promise.reject(new Error("AI down")))).rejects.toThrow("AI down");
    expect(getEntitlement("j2").juryRuns?.["app-1"]).toBe(0);
  });

  it("Pro is unlimited", async () => {
    await grantPro("j3");
    for (let i = 0; i < JURY_RUNS_PER_APPLICATION + 2; i++) await withJuryRun("j3", "app-1", async () => "ok");
    expect(getEntitlement("j3").juryRuns).toBeUndefined();
  });
});

describe("/api/entitlements", () => {
  it("POST grants (mock) to the signed-in user and GET reads it back", async () => {
    const posted = await (await POST(req("/api/entitlements", { body: { purchasedProductId: "mecena_pro_annual", via: "mock" } }))).json();
    expect(posted.entitlement).toMatchObject({ appUserId: DEMO_APP_USER_ID, pro: true, activeProductId: "mecena_pro_annual", source: "mock" });
    const got = await (await GET(req("/api/entitlements"))).json();
    expect(got.entitlement.pro).toBe(true);
  });

  it("never grants from a pro / premiumCredits claim, even in mock mode", async () => {
    const res = await POST(req("/api/entitlements", { body: { pro: true, premiumCredits: 999, via: "revenuecat" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).entitlement).toMatchObject({ pro: false, premiumCredits: 0 });
    expect(getEntitlement(DEMO_APP_USER_ID)).toMatchObject({ pro: false, premiumCredits: 0 });
  });

  it("rejects an unknown product id (400)", async () => {
    expect((await POST(req("/api/entitlements", { body: { purchasedProductId: "free_money" } }))).status).toBe(400);
  });

  it("production without the secret key: refuses any purchase claim (503, logged) and grants nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const body of [{ purchasedProductId: "mecena_pro_annual" }, { purchasedProductId: "mecena_solicitud_premium", pro: true, premiumCredits: 999 }]) {
      const res = await POST(req("/api/entitlements", { body }));
      expect(res.status).toBe(503);
      expect((await res.json()).message).toMatch(/Restaurar compras/);
    }
    expect(log.mock.calls.some((c) => String(c[0]).includes("REVENUECAT_SECRET_API_KEY is not set"))).toBe(true);
    expect((await POST(req("/api/entitlements", { body: { pro: true, premiumCredits: 999 } }))).status).toBe(200);
    expect(getEntitlement(DEMO_APP_USER_ID)).toMatchObject({ pro: false, premiumCredits: 0 });
  });

  it("a non-mock build without the secret key refuses too", async () => {
    vi.stubEnv("NEXT_PUBLIC_PURCHASES_MOCK", "0");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST(req("/api/entitlements", { body: { purchasedProductId: "mecena_pro_monthly" } }))).status).toBe(503);
    expect(getEntitlement(DEMO_APP_USER_ID).pro).toBe(false);
  });

  it("refresh without the secret key returns the stored state", async () => {
    await grantPro(DEMO_APP_USER_ID);
    const res = await POST(req("/api/entitlements", { body: { refresh: true } }));
    expect((await res.json()).entitlement.pro).toBe(true);
    expect((await (await GET(req("/api/entitlements?refresh=1"))).json()).entitlement.pro).toBe(true);
  });

  it("ignores a client-supplied appUserId: the purchase lands on the user's own id, and nobody reads someone else's", async () => {
    const posted = await (await POST(req("/api/entitlements", { body: { appUserId: "u3", purchasedProductId: "mecena_pro_annual" } }))).json();
    expect(posted.entitlement.appUserId).toBe(DEMO_APP_USER_ID);
    expect(getEntitlement("u3").pro).toBe(false);
    await syncEntitlement({ appUserId: "u4", purchasedProductId: "mecena_pro_monthly" });
    const { cookie } = await createUser("sin-pro@mecena.test");
    const got = await (await GET(req("/api/entitlements?appUserId=u4", { cookie }))).json();
    expect(got.entitlement.pro).toBe(false);
  });

  it("401 without a session", async () => {
    expect((await GET(req("/api/entitlements", { cookie: null }))).status).toBe(401);
    expect((await POST(req("/api/entitlements", { body: { refresh: true }, cookie: null }))).status).toBe(401);
  });
});
