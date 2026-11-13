"use client";
// STUB (scaffold, working baseline). Owned by WP-07: RevenueCat adapter (@revenuecat/purchases-js) + richer mock.
import { API, PRODUCTS, publicEnv, type EntitlementState, type Plan, type PlanId, type PurchaseOutcome, type PurchasesAdapter } from "@/contracts";

const PLANS: Plan[] = [
  { id: "proMonthly", title: "Pro mensual", priceText: "9,00 €/mes", kind: "subscription", period: "P1M", bullets: [] },
  { id: "proAnnual", title: "Pro anual", priceText: "79,00 €/año", kind: "subscription", period: "P1Y", highlight: true, bullets: [] },
  { id: "solicitudPremium", title: "Solicitud premium", priceText: "15,00 €", kind: "one_off", bullets: [] },
];

export class MockPurchases implements PurchasesAdapter {
  readonly mode = "mock" as const;
  private appUserId = "";
  async init(appUserId: string) {
    this.appUserId = appUserId;
  }
  async getPlans() {
    return PLANS;
  }
  async getEntitlement(): Promise<EntitlementState> {
    const r = await fetch(`${API.entitlements}?appUserId=${encodeURIComponent(this.appUserId)}`);
    return (await r.json()).entitlement;
  }
  async purchase(planId: PlanId): Promise<PurchaseOutcome> {
    const r = await fetch(API.entitlements, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appUserId: this.appUserId, purchasedProductId: PRODUCTS[planId] }),
    });
    if (!r.ok) return { status: "error", message: "No se pudo completar la compra" };
    return { status: "purchased", entitlement: (await r.json()).entitlement };
  }
}

let instance: PurchasesAdapter | undefined;
export function getPurchases(): PurchasesAdapter {
  // TODO(WP-07): return a RevenueCatPurchases adapter when !publicEnv().purchasesMock
  void publicEnv;
  instance ??= new MockPurchases();
  return instance;
}
