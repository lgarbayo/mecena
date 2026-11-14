"use client";
// Owned by WP-07. Purchases adapters behind one interface:
// - RevenueCatPurchases: @revenuecat/purchases-js Web Billing (sandbox key rcb_sb_… for the demo), checkout embedded in our sheet
// - MockPurchases: no keys; the paywall shows a "Modo prueba" confirm step and grants through /api/entitlements
// Either way the server sync (POST /api/entitlements) is what unlocks drafting: with the RevenueCat secret key it
// re-reads the customer over REST, and nothing the client claims is trusted.
import { API, PACKAGES, PRODUCTS, publicEnv, type EntitlementState, type Plan, type PlanId, type PurchaseOutcome, type PurchasesAdapter } from "@/contracts";
import { OFFER, PLANS, plansWithPrices } from "./offer";

/** An /api/entitlements failure, with the server's Spanish message when it sent one. */
class SyncError extends Error {}

async function entitlementRequest(init?: RequestInit, query = ""): Promise<EntitlementState> {
  const r = await fetch(`${API.entitlements}${query}`, { cache: "no-store", ...init });
  const data = (await r.json().catch(() => ({}))) as { entitlement?: EntitlementState; message?: string };
  if (!r.ok || !data.entitlement) throw new SyncError(r.status === 503 && data.message ? data.message : `sync ${r.status}`);
  return data.entitlement;
}

const sync = (body: Record<string, unknown>) =>
  entitlementRequest({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The server always reads the signed-in user's entitlement (no app user id is sent). */
const readEntitlement = () => entitlementRequest();

/** "Restaurar compras": the server re-reads the customer from RevenueCat. */
const restoreEntitlement = () => sync({ refresh: true });

export class MockPurchases implements PurchasesAdapter {
  readonly mode = "mock" as const;
  async init() {}
  async getPlans() {
    return PLANS;
  }
  async getEntitlement() {
    return readEntitlement();
  }
  async restore() {
    return restoreEntitlement();
  }
  async purchase(planId: PlanId): Promise<PurchaseOutcome> {
    try {
      return { status: "purchased", entitlement: await sync({ purchasedProductId: PRODUCTS[planId], via: "mock" }) };
    } catch (e) {
      return { status: "error", message: e instanceof SyncError && !e.message.startsWith("sync ") ? e.message : "No se pudo completar la compra" };
    }
  }
}

type SDK = typeof import("@revenuecat/purchases-js");
type RcPackage = import("@revenuecat/purchases-js").Package;

export class RevenueCatPurchases implements PurchasesAdapter {
  readonly mode = "revenuecat" as const;
  private sdk?: SDK;
  private appUserId = "";
  /** The init in progress / done for `appUserId`: purchase() waits for it, so an early tap never hits an unloaded SDK. */
  private ready?: Promise<void>;
  private packages = new Map<PlanId, RcPackage>();

  constructor(private readonly apiKey: string, private readonly offeringId: string) {}

  /** Configure once per page load; after a demo reset the app user id rotates, so switch the customer. */
  init(appUserId: string): Promise<void> {
    if (this.ready && this.appUserId === appUserId) return this.ready;
    this.appUserId = appUserId;
    this.packages.clear();
    const ready = (async () => {
      this.sdk ??= await import("@revenuecat/purchases-js");
      const { Purchases } = this.sdk;
      if (!Purchases.isConfigured()) Purchases.configure({ apiKey: this.apiKey, appUserId });
      else if (Purchases.getSharedInstance().getAppUserId() !== appUserId) await Purchases.getSharedInstance().changeUser(appUserId);
    })();
    this.ready = ready;
    ready.catch(() => {
      if (this.ready === ready) this.ready = undefined; // let the next init retry
    });
    return ready;
  }

  async getPlans(): Promise<Plan[]> {
    if (!this.ready) throw new Error("RevenueCat is not initialised");
    await this.ready;
    const offerings = await this.sdk!.Purchases.getSharedInstance().getOfferings();
    const offering = offerings.all[this.offeringId] ?? offerings.current;
    if (!offering) return PLANS;
    const prices: Partial<Record<PlanId, { amount: number; currency: string }>> = {};
    for (const plan of PLANS) {
      const pkg = offering.packagesById[PACKAGES[plan.id]];
      if (!pkg) continue;
      this.packages.set(plan.id, pkg);
      const price = pkg.webBillingProduct.currentPrice ?? pkg.webBillingProduct.price;
      prices[plan.id] = { amount: price.amountMicros / 1e6, currency: price.currency };
    }
    return plansWithPrices(prices);
  }

  async getEntitlement() {
    return readEntitlement();
  }

  async restore() {
    return restoreEntitlement();
  }

  async purchase(planId: PlanId, opts?: { htmlTarget?: HTMLElement; email?: string }): Promise<PurchaseOutcome> {
    let rcPackage: RcPackage | undefined;
    try {
      if (!this.ready) return { status: "error", message: OFFER.loading };
      await this.ready;
      if (!this.packages.size) await this.getPlans();
      rcPackage = this.packages.get(planId);
    } catch {
      return { status: "error", message: OFFER.loadError };
    }
    if (!rcPackage) return { status: "error", message: "Este plan no está disponible ahora mismo" };
    try {
      const { Purchases, PurchasesError, ErrorCode } = this.sdk!;
      try {
        await Purchases.getSharedInstance().purchase({ rcPackage, htmlTarget: opts?.htmlTarget, customerEmail: opts?.email });
      } catch (e) {
        if (e instanceof PurchasesError && e.errorCode === ErrorCode.UserCancelledError) return { status: "cancelled" };
        throw e;
      }
    } catch (e) {
      return { status: "error", message: e instanceof Error ? e.message : "No se pudo completar la compra" };
    }
    try {
      // the server re-reads the customer from RevenueCat REST; the product id is only a hint
      const entitlement = await sync({ purchasedProductId: PRODUCTS[planId], via: "revenuecat" });
      return { status: "purchased", entitlement };
    } catch {
      return { status: "error", message: OFFER.paidNotSynced };
    }
  }
}

let instance: PurchasesAdapter | undefined;
export function getPurchases(): PurchasesAdapter {
  if (instance) return instance;
  const env = publicEnv();
  instance = env.purchasesMock || !env.revenueCatApiKey ? new MockPurchases() : new RevenueCatPurchases(env.revenueCatApiKey, env.offeringId);
  return instance;
}
