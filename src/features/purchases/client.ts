"use client";
// Owned by WP-07. Purchases adapters behind one interface:
// - RevenueCatPurchases: @revenuecat/purchases-js Web Billing (sandbox key rcb_sb_… for the demo), checkout embedded in our sheet
// - MockPurchases: no keys; the paywall shows a "Modo prueba" confirm step and grants through /api/entitlements
// Either way the server sync (POST /api/entitlements) is what unlocks drafting.
import { API, PACKAGES, PRODUCTS, publicEnv, type EntitlementState, type Plan, type PlanId, type PurchaseOutcome, type PurchasesAdapter } from "@/contracts";
import { PLANS, plansWithPrices } from "./offer";

async function sync(body: Record<string, unknown>): Promise<EntitlementState> {
  const r = await fetch(API.entitlements, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`sync ${r.status}`);
  return (await r.json()).entitlement as EntitlementState;
}

async function readEntitlement(appUserId: string): Promise<EntitlementState> {
  const r = await fetch(`${API.entitlements}?appUserId=${encodeURIComponent(appUserId)}`, { cache: "no-store" });
  return (await r.json()).entitlement as EntitlementState;
}

export class MockPurchases implements PurchasesAdapter {
  readonly mode = "mock" as const;
  private appUserId = "";
  async init(appUserId: string) {
    this.appUserId = appUserId;
  }
  async getPlans() {
    return PLANS;
  }
  async getEntitlement() {
    return readEntitlement(this.appUserId);
  }
  async purchase(planId: PlanId): Promise<PurchaseOutcome> {
    try {
      return { status: "purchased", entitlement: await sync({ appUserId: this.appUserId, purchasedProductId: PRODUCTS[planId], via: "mock" }) };
    } catch {
      return { status: "error", message: "No se pudo completar la compra" };
    }
  }
}

type SDK = typeof import("@revenuecat/purchases-js");
type RcPackage = import("@revenuecat/purchases-js").Package;

export class RevenueCatPurchases implements PurchasesAdapter {
  readonly mode = "revenuecat" as const;
  private sdk?: SDK;
  private appUserId = "";
  private packages = new Map<PlanId, RcPackage>();

  constructor(private readonly apiKey: string, private readonly offeringId: string) {}

  /** Configure once per page load; after a demo reset the app user id rotates, so switch the customer. */
  async init(appUserId: string) {
    this.sdk ??= await import("@revenuecat/purchases-js");
    const { Purchases } = this.sdk;
    if (!Purchases.isConfigured()) Purchases.configure({ apiKey: this.apiKey, appUserId });
    else if (Purchases.getSharedInstance().getAppUserId() !== appUserId) await Purchases.getSharedInstance().changeUser(appUserId);
    if (this.appUserId !== appUserId) this.packages.clear();
    this.appUserId = appUserId;
  }

  async getPlans(): Promise<Plan[]> {
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
    return readEntitlement(this.appUserId);
  }

  async purchase(planId: PlanId, opts?: { htmlTarget?: HTMLElement; email?: string }): Promise<PurchaseOutcome> {
    const { Purchases, PurchasesError, ErrorCode } = this.sdk!;
    if (!this.packages.size) await this.getPlans();
    const rcPackage = this.packages.get(planId);
    if (!rcPackage) return { status: "error", message: "Este plan no está disponible ahora mismo" };
    try {
      await Purchases.getSharedInstance().purchase({ rcPackage, htmlTarget: opts?.htmlTarget, customerEmail: opts?.email });
    } catch (e) {
      if (e instanceof PurchasesError && e.errorCode === ErrorCode.UserCancelledError) return { status: "cancelled" };
      return { status: "error", message: e instanceof Error ? e.message : "No se pudo completar la compra" };
    }
    try {
      // the server re-verifies with RevenueCat REST when it has the secret key; the claim is only used without it
      const entitlement = await sync({ appUserId: this.appUserId, purchasedProductId: PRODUCTS[planId], via: "revenuecat" });
      return { status: "purchased", entitlement };
    } catch {
      return { status: "error", message: "El pago se ha hecho, pero no hemos podido activar tu plan. Recarga la página." };
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
