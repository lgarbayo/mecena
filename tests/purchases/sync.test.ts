import { afterEach, describe, expect, it } from "vitest";
import { entitlementFromSubscriber, syncEntitlement, type Subscriber } from "@/features/purchases/server";
import { getEntitlement } from "@/server/store";

const USER = "mecena-demo-rc";
const future = new Date(Date.now() + 30 * 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();

function stub(subscriber: Subscriber, seen: string[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push(`${url} ${(init?.headers as Record<string, string>)?.authorization ?? ""}`);
    return Response.json({ subscriber });
  }) as typeof fetch;
}

afterEach(() => {
  delete process.env.REVENUECAT_SECRET_API_KEY;
});

describe("syncEntitlement with REVENUECAT_SECRET_API_KEY (REST re-verification)", () => {
  it("reads pro from the active 'pro' entitlement and ignores the client claim", async () => {
    process.env.REVENUECAT_SECRET_API_KEY = "sk_test_x";
    const seen: string[] = [];
    const e = await syncEntitlement(
      { appUserId: USER, pro: false, purchasedProductId: "mecena_solicitud_premium" },
      stub({ entitlements: { pro: { expires_date: future, product_identifier: "mecena_pro_monthly", purchase_date: past } } }, seen),
    );
    expect(seen[0]).toBe(`https://api.revenuecat.com/v1/subscribers/${USER} Bearer sk_test_x`);
    expect(e).toMatchObject({ pro: true, premiumCredits: 0, activeProductId: "mecena_pro_monthly", expiresAt: future, source: "revenuecat" });
    expect(getEntitlement(USER).pro).toBe(true);
  });

  it("an expired entitlement is not Pro", async () => {
    process.env.REVENUECAT_SECRET_API_KEY = "sk_test_x";
    const e = await syncEntitlement({ appUserId: USER }, stub({ entitlements: { pro: { expires_date: past, product_identifier: "mecena_pro_monthly", purchase_date: past } } }));
    expect(e.pro).toBe(false);
  });

  it("premium credits: one per transaction, never counted twice across syncs", async () => {
    process.env.REVENUECAT_SECRET_API_KEY = "sk_test_x";
    const t1 = { id: "t1", purchase_date: new Date(Date.now() - 60_000).toISOString() };
    const first = await syncEntitlement({ appUserId: USER }, stub({ non_subscriptions: { mecena_solicitud_premium: [t1] } }));
    expect(first.premiumCredits).toBe(1);
    // same customer again, no new purchase → still 1
    const again = await syncEntitlement({ appUserId: USER }, stub({ non_subscriptions: { mecena_solicitud_premium: [t1] } }));
    expect(again.premiumCredits).toBe(1);
    // a new purchase after the last sync → 2
    const t2 = { id: "t2", purchase_date: new Date(Date.now() + 1000).toISOString() };
    const third = await syncEntitlement({ appUserId: USER }, stub({ non_subscriptions: { mecena_solicitud_premium: [t1, t2] } }));
    expect(third.premiumCredits).toBe(2);
  });

  it("a RevenueCat error surfaces instead of granting anything", async () => {
    process.env.REVENUECAT_SECRET_API_KEY = "sk_test_x";
    const failing = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    await expect(syncEntitlement({ appUserId: USER, pro: true }, failing)).rejects.toThrow(/RevenueCat 401/);
    expect(getEntitlement(USER).pro).toBe(false);
  });
});

describe("syncEntitlement without a secret key (sandbox demo: trusts the client claim)", () => {
  it("SDK claim → source revenuecat; mock claim → source mock", async () => {
    expect((await syncEntitlement({ appUserId: "a", purchasedProductId: "mecena_pro_annual", via: "revenuecat" })).source).toBe("revenuecat");
    expect((await syncEntitlement({ appUserId: "b", purchasedProductId: "mecena_pro_annual" })).source).toBe("mock");
  });
});

describe("entitlementFromSubscriber", () => {
  it("uses the dashboard entitlement identifier from NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID", () => {
    const sub = { entitlements: { mecena_pro: { expires_date: future, product_identifier: "MecenaTest", purchase_date: past } } };
    expect(entitlementFromSubscriber(USER, sub, undefined).pro).toBe(false); // default id "pro"
    process.env.NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID = "mecena_pro";
    try {
      expect(entitlementFromSubscriber(USER, sub, undefined)).toMatchObject({ pro: true, activeProductId: "MecenaTest" });
    } finally {
      delete process.env.NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID;
    }
  });

  it("lifetime entitlement (no expiry) is Pro", () => {
    const e = entitlementFromSubscriber(USER, { entitlements: { pro: { expires_date: null, product_identifier: "x", purchase_date: past } } }, undefined);
    expect(e.pro).toBe(true);
    expect(e.expiresAt).toBeUndefined();
  });
});
