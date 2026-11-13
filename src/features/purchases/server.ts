// STUB (scaffold, working baseline). Owned by WP-07: RevenueCat REST verification, credit consumption rules.
import { canDraft, PaymentRequiredError, PRODUCTS, type EntitlementState } from "@/contracts";
import { getEntitlement, getMeta, nowIso, saveEntitlement } from "@/server/store";

export async function resolveEntitlement(appUserId?: string): Promise<EntitlementState> {
  return getEntitlement(appUserId ?? getMeta().appUserId);
}

/** Throws PaymentRequiredError unless the user is Pro or has a Solicitud premium credit. */
export async function requireDraftEntitlement(appUserId?: string): Promise<EntitlementState> {
  const e = await resolveEntitlement(appUserId);
  if (!canDraft(e)) throw new PaymentRequiredError();
  return e;
}

/** Call after a successful draft: uses one premium credit when the user is not Pro. */
export async function consumeDraftCredit(appUserId?: string): Promise<EntitlementState> {
  const e = await resolveEntitlement(appUserId);
  if (e.pro || e.premiumCredits <= 0) return e;
  return saveEntitlement({ ...e, premiumCredits: e.premiumCredits - 1, updatedAt: nowIso() });
}

/**
 * POST /api/entitlements. Baseline = mock grant by product id.
 * TODO(WP-07): when REVENUECAT_SECRET_API_KEY is set, ignore client claims and read the customer's
 * entitlements from RevenueCat REST (GET /v1/subscribers/{appUserId}) before saving.
 */
export async function syncEntitlement(input: { appUserId: string; purchasedProductId?: string; pro?: boolean; premiumCredits?: number }): Promise<EntitlementState> {
  const cur = getEntitlement(input.appUserId);
  const next: EntitlementState = { ...cur, source: "mock", updatedAt: nowIso() };
  if (input.purchasedProductId === PRODUCTS.solicitudPremium) next.premiumCredits = cur.premiumCredits + 1;
  else if (input.purchasedProductId === PRODUCTS.proMonthly || input.purchasedProductId === PRODUCTS.proAnnual) {
    next.pro = true;
    next.activeProductId = input.purchasedProductId;
  }
  if (input.pro !== undefined) next.pro = input.pro;
  if (input.premiumCredits !== undefined) next.premiumCredits = input.premiumCredits;
  return saveEntitlement(next);
}
