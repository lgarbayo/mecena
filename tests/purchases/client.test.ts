// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

// A fake @revenuecat/purchases-js whose import resolves only when the test says so (a slow network).
const { gate, releaseSdk, purchase } = vi.hoisted(() => {
  let releaseSdk: () => void = () => undefined;
  const gate = new Promise<void>((r) => (releaseSdk = r));
  return { gate, releaseSdk: () => releaseSdk(), purchase: vi.fn(async () => ({})) };
});
const fakePackage = { webBillingProduct: { price: { amountMicros: 9e6, currency: "EUR" } } };
vi.mock("@revenuecat/purchases-js", async () => {
  await gate;
  class PurchasesError extends Error {
    errorCode = 0;
  }
  let configured = false;
  const shared = {
    getAppUserId: () => "u-rc",
    changeUser: async () => undefined,
    getOfferings: async () => ({ all: { default: { packagesById: { $rc_monthly: fakePackage } } }, current: null }),
    purchase,
  };
  return {
    Purchases: {
      isConfigured: () => configured,
      configure: () => {
        configured = true;
      },
      getSharedInstance: () => shared,
    },
    PurchasesError,
    ErrorCode: { UserCancelledError: 1 },
  };
});

const { RevenueCatPurchases } = await import("@/features/purchases/client");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RevenueCatPurchases", () => {
  it("before init: a tap returns an error instead of throwing", async () => {
    const rc = new RevenueCatPurchases("rcb_sb_x", "default");
    expect(await rc.purchase("proMonthly")).toMatchObject({ status: "error" });
  });

  it("a tap while the SDK is still loading waits for init, then buys and syncs with the server", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ entitlement: { appUserId: "u-rc", pro: true, premiumCredits: 0, source: "revenuecat", updatedAt: "x" } }));
    const rc = new RevenueCatPurchases("rcb_sb_x", "default");
    const init = rc.init("u-rc");
    expect(rc.init("u-rc")).toBe(init); // one init per user
    const out = rc.purchase("proMonthly");
    releaseSdk();
    expect(await out).toMatchObject({ status: "purchased", entitlement: { pro: true } });
    expect(purchase).toHaveBeenCalledTimes(1);
  });

  it("paid but the server sync failed: points to 'Restaurar compras'", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "purchase_unverified", message: "x" }, { status: 503 }));
    const rc = new RevenueCatPurchases("rcb_sb_x", "default");
    await rc.init("u-rc");
    const out = await rc.purchase("proMonthly");
    expect(out).toMatchObject({ status: "error" });
    expect(out.status === "error" && out.message).toContain("Restaurar compras");
  });
});
