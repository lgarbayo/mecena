import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/entitlements/route";
import {
  DEMO_PRODUCT_ID,
  entitlementFromSubscriber,
  PurchaseVerificationError,
  reserveDraftCredit,
  resetPurchaseSyncState,
  resolveEntitlement,
  syncEntitlement,
  type Subscriber,
} from "@/features/purchases/server";
import { DEMO_APP_USER_ID } from "@/fixtures";
import { getEntitlement, nowIso, saveEntitlement } from "@/server/store";
import { loginDemo, req } from "../helpers";

const USER = "mecena-demo-rc";
const future = new Date(Date.now() + 30 * 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();
const longAgo = new Date(Date.now() - 2 * 864e5).toISOString(); // last verified before the period ended
const tx = (id: string, ago = 60_000) => ({ id, purchase_date: new Date(Date.now() - ago).toISOString() });
// keyed by our dashboard identifier (default "mecena_pro")
const proEnt = (expires: string | null) => ({ mecena_pro: { expires_date: expires, product_identifier: "mecena_pro_monthly", purchase_date: past } });

function stub(subscriber: Subscriber, seen: string[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push(`${url} ${(init?.headers as Record<string, string>)?.authorization ?? ""}`);
    return Response.json({ subscriber });
  }) as typeof fetch;
}

beforeEach(() => {
  vi.stubEnv("REVENUECAT_SECRET_API_KEY", "sk_test_x");
});

afterEach(() => {
  resetPurchaseSyncState();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("syncEntitlement with REVENUECAT_SECRET_API_KEY (REST re-verification)", () => {
  it("reads pro from the active entitlement and ignores the client's product id", async () => {
    const seen: string[] = [];
    const e = await syncEntitlement({ appUserId: USER, purchasedProductId: "mecena_solicitud_premium" }, stub({ entitlements: proEnt(future) }, seen));
    expect(seen[0]).toBe(`https://api.revenuecat.com/v1/subscribers/${USER} Bearer sk_test_x`);
    expect(e).toMatchObject({ pro: true, premiumCredits: 0, activeProductId: "mecena_pro_monthly", expiresAt: future, source: "revenuecat" });
    expect(e.verifiedAt).toBeDefined();
    expect(getEntitlement(USER).pro).toBe(true);
  });

  it("an expired entitlement is not Pro", async () => {
    const e = await syncEntitlement({ appUserId: USER }, stub({ entitlements: proEnt(past) }));
    expect(e.pro).toBe(false);
  });

  it("premium credits = unique one-off transactions minus the ones spent on drafts", async () => {
    const t1 = tx("t1");
    expect((await syncEntitlement({ appUserId: USER }, stub({ non_subscriptions: { mecena_solicitud_premium: [t1] } }))).premiumCredits).toBe(1);
    // same customer again → still 1 (a transaction is never counted twice)
    expect((await syncEntitlement({ appUserId: USER }, stub({ non_subscriptions: { mecena_solicitud_premium: [t1, t1] } }))).premiumCredits).toBe(1);
    // spend it on a draft, then re-sync: RevenueCat still lists t1, but it is used
    await reserveDraftCredit(USER);
    expect((await syncEntitlement({ appUserId: USER }, stub({ non_subscriptions: { mecena_solicitud_premium: [t1] } }))).premiumCredits).toBe(0);
    // a second purchase → 1 again
    const again = await syncEntitlement({ appUserId: USER }, stub({ non_subscriptions: { mecena_solicitud_premium: [t1, tx("t2", 0)] } }));
    expect(again).toMatchObject({ premiumCredits: 1, premiumUsed: 1 });
  });

  it("a claim-based legacy state cannot keep credits that RevenueCat does not know about", async () => {
    await saveEntitlement({ appUserId: USER, pro: true, premiumCredits: 999, source: "revenuecat", updatedAt: nowIso() });
    const e = await syncEntitlement({ appUserId: USER }, stub({ non_subscriptions: { mecena_solicitud_premium: [tx("t1")] } }));
    expect(e).toMatchObject({ pro: false, premiumCredits: 1, premiumUsed: 0 });
  });

  it("legacy state: credits already spent stay spent", async () => {
    // old scheme: bought t1 (synced), spent it → premiumCredits 0, no premiumUsed
    await saveEntitlement({ appUserId: USER, pro: false, premiumCredits: 0, source: "revenuecat", updatedAt: nowIso() });
    const e = await syncEntitlement({ appUserId: USER }, stub({ non_subscriptions: { mecena_solicitud_premium: [tx("t1")] } }));
    expect(e).toMatchObject({ premiumCredits: 0, premiumUsed: 1 });
  });

  it("a RevenueCat error surfaces as PurchaseVerificationError instead of granting anything", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(syncEntitlement({ appUserId: USER, purchasedProductId: "mecena_pro_annual" }, failing)).rejects.toBeInstanceOf(PurchaseVerificationError);
    expect(getEntitlement(USER).pro).toBe(false);
  });

  it("keeps a server-side demo grant (activeProductId 'demo') and only updates its credits", async () => {
    await saveEntitlement({ appUserId: USER, pro: true, premiumCredits: 0, activeProductId: DEMO_PRODUCT_ID, source: "mock", updatedAt: nowIso() });
    const seen: string[] = [];
    vi.stubGlobal("fetch", stub({}, seen));
    expect((await resolveEntitlement(USER)).pro).toBe(true);
    expect(seen).toHaveLength(0); // never re-verified on read
    const e = await syncEntitlement({ appUserId: USER, refresh: true }, stub({ non_subscriptions: { mecena_solicitud_premium: [tx("t1", 0)] } }));
    expect(e).toMatchObject({ pro: true, activeProductId: DEMO_PRODUCT_ID, premiumCredits: 1 });
  });
});

describe("lazy re-sync on read", () => {
  it("an expired Pro is re-read from RevenueCat (renewed → still Pro, with the new expiry)", async () => {
    await saveEntitlement({ appUserId: USER, pro: true, premiumCredits: 0, expiresAt: past, verifiedAt: longAgo, source: "revenuecat", updatedAt: longAgo });
    const seen: string[] = [];
    vi.stubGlobal("fetch", stub({ entitlements: proEnt(future) }, seen));
    expect(await resolveEntitlement(USER)).toMatchObject({ pro: true, expiresAt: future });
    expect(seen).toHaveLength(1);
    expect(await resolveEntitlement(USER)).toMatchObject({ pro: true });
    expect(seen).toHaveLength(1); // fresh again: no new request
  });

  it("an expired Pro that was not renewed ends, and stays ended without asking again", async () => {
    await saveEntitlement({ appUserId: USER, pro: true, premiumCredits: 0, expiresAt: past, verifiedAt: longAgo, source: "revenuecat", updatedAt: longAgo });
    const seen: string[] = [];
    vi.stubGlobal("fetch", stub({ entitlements: proEnt(past) }, seen));
    expect((await resolveEntitlement(USER)).pro).toBe(false);
    expect((await resolveEntitlement(USER)).pro).toBe(false);
    expect(seen).toHaveLength(1);
  });

  it("RevenueCat down: an expired Pro reads as not Pro", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await saveEntitlement({ appUserId: USER, pro: true, premiumCredits: 0, expiresAt: past, verifiedAt: longAgo, source: "revenuecat", updatedAt: longAgo });
    vi.stubGlobal("fetch", async () => new Response("down", { status: 500 }));
    expect((await resolveEntitlement(USER)).pro).toBe(false);
  });

  it("a state written from a client claim (never verified) is verified once", async () => {
    await saveEntitlement({ appUserId: USER, pro: true, premiumCredits: 3, source: "revenuecat", updatedAt: past });
    vi.stubGlobal("fetch", stub({}));
    expect(await resolveEntitlement(USER)).toMatchObject({ pro: false, premiumCredits: 0 });
  });

  it("a paid purchase whose sync failed still unlocks the draft: the gate asks RevenueCat first", async () => {
    vi.stubGlobal("fetch", stub({ non_subscriptions: { mecena_solicitud_premium: [tx("t1")] } }));
    expect((await reserveDraftCredit(USER)).usedCredit).toBe(true);
    expect(getEntitlement(USER)).toMatchObject({ premiumCredits: 0, premiumUsed: 1 });
  });
});

describe("review fixes", () => {
  it("a lapsed Pro keeps asking RevenueCat (at most once a minute) while a renewal may be on its way", async () => {
    const justExpired = new Date(Date.now() - 5 * 60e3).toISOString();
    await saveEntitlement({ appUserId: USER, pro: false, premiumCredits: 0, premiumUsed: 0, expiresAt: justExpired, verifiedAt: new Date(Date.now() - 2 * 60e3).toISOString(), source: "revenuecat", updatedAt: nowIso() });
    const seen: string[] = [];
    vi.stubGlobal("fetch", stub({ entitlements: proEnt(future) }, seen));
    expect((await resolveEntitlement(USER)).pro).toBe(true); // the renewal landed
    expect(seen).toHaveLength(1);
  });

  it("after a RevenueCat failure, lazy re-syncs pause instead of waiting on every request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await saveEntitlement({ appUserId: USER, pro: true, premiumCredits: 0, expiresAt: past, verifiedAt: longAgo, source: "revenuecat", updatedAt: longAgo });
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response("down", { status: 500 });
    });
    await resolveEntitlement(USER);
    await resolveEntitlement(USER);
    expect(calls).toBe(1);
  });

  it("an unverified legacy claim grants nothing while RevenueCat is down, and its credit cannot be spent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await saveEntitlement({ appUserId: USER, pro: true, premiumCredits: 999, source: "revenuecat", updatedAt: nowIso() });
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    expect(await resolveEntitlement(USER)).toMatchObject({ pro: false, premiumCredits: 0 });
    resetPurchaseSyncState();
    await expect(reserveDraftCredit(USER)).rejects.toThrow();
    expect(getEntitlement(USER)).toMatchObject({ premiumCredits: 999 }); // untouched: premiumUsed not invented
    expect(getEntitlement(USER).premiumUsed).toBeUndefined();
  });

  it("without the secret key (production) an unverified claim grants nothing, but a demo grant still does", async () => {
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    await saveEntitlement({ appUserId: USER, pro: true, premiumCredits: 5, source: "revenuecat", updatedAt: nowIso() });
    expect(await resolveEntitlement(USER)).toMatchObject({ pro: false, premiumCredits: 0 });
    await saveEntitlement({ appUserId: "demo-user", pro: true, premiumCredits: 0, activeProductId: DEMO_PRODUCT_ID, source: "mock", updatedAt: nowIso() });
    expect((await resolveEntitlement("demo-user")).pro).toBe(true);
  });

  it("legacy credit accounting dedupes transactions by id", () => {
    const t1 = tx("t1");
    const prev = { appUserId: USER, pro: false, premiumCredits: 0, source: "revenuecat" as const, updatedAt: nowIso() };
    expect(entitlementFromSubscriber(USER, { non_subscriptions: { mecena_solicitud_premium: [t1, t1, tx("t2")] } }, prev)).toMatchObject({ premiumUsed: 2, premiumCredits: 0 });
  });
});

describe("/api/entitlements with the secret key", () => {
  beforeEach(async () => {
    await loginDemo();
  });

  it("'Restaurar compras' (POST refresh) and GET ?refresh=1 re-read the customer", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", stub({ entitlements: proEnt(future) }, seen));
    const posted = await (await POST(req("/api/entitlements", { body: { refresh: true } }))).json();
    expect(posted.entitlement).toMatchObject({ appUserId: DEMO_APP_USER_ID, pro: true });
    expect((await (await GET(req("/api/entitlements?refresh=1"))).json()).entitlement.pro).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain(`/subscribers/${DEMO_APP_USER_ID} `);
  });

  it("a client claim of Pro or credits changes nothing: RevenueCat decides", async () => {
    vi.stubGlobal("fetch", stub({}));
    const posted = await (await POST(req("/api/entitlements", { body: { pro: true, premiumCredits: 999, purchasedProductId: "mecena_pro_annual" } }))).json();
    expect(posted.entitlement).toMatchObject({ pro: false, premiumCredits: 0 });
  });

  it("RevenueCat unreachable → 503 with a Spanish message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", async () => new Response("down", { status: 500 }));
    const res = await POST(req("/api/entitlements", { body: { refresh: true } }));
    expect(res.status).toBe(503);
    expect((await res.json()).message).toMatch(/Restaurar compras/);
    expect((await GET(req("/api/entitlements?refresh=1"))).status).toBe(503);
    expect((await GET(req("/api/entitlements"))).status).toBe(200);
  });
});

describe("entitlementFromSubscriber", () => {
  it("uses the dashboard entitlement identifier from NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID", () => {
    const sub = { entitlements: { mecena_pro: { expires_date: future, product_identifier: "MecenaTest", purchase_date: past } } };
    expect(entitlementFromSubscriber(USER, sub, undefined, new Date(), "pro").pro).toBe(false);
    expect(entitlementFromSubscriber(USER, sub, undefined, new Date(), "mecena_pro")).toMatchObject({ pro: true, activeProductId: "MecenaTest" });
  });

  it("defaults to our dashboard identifier, mecena_pro", () => {
    expect(entitlementFromSubscriber(USER, { entitlements: proEnt(future) }, undefined).pro).toBe(true);
  });

  it("lifetime entitlement (no expiry) is Pro", () => {
    const e = entitlementFromSubscriber(USER, { entitlements: { pro: { expires_date: null, product_identifier: "x", purchase_date: past } } }, undefined, new Date(), "pro");
    expect(e.pro).toBe(true);
    expect(e.expiresAt).toBeUndefined();
  });

  it("keeps the jury run counters", () => {
    const prev = { appUserId: USER, pro: false, premiumCredits: 0, premiumUsed: 0, juryRuns: { a: 2 }, source: "mock" as const, updatedAt: nowIso() };
    expect(entitlementFromSubscriber(USER, {}, prev).juryRuns).toEqual({ a: 2 });
  });
});
