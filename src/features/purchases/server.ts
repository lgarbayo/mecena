// Owned by WP-07. Entitlements on the server: the draft gate trusts only what is stored here.
// With REVENUECAT_SECRET_API_KEY the sync ignores client claims and reads the customer from RevenueCat REST.
import { canDraft, ENTITLEMENT_PRO, PaymentRequiredError, PRODUCTS, serverEnv, type EntitlementState } from "@/contracts";
import { getEntitlement, getMeta, nowIso, readDb, saveEntitlement } from "@/server/store";

export const REVENUECAT_API = "https://api.revenuecat.com/v1";

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

/** Subset of GET /v1/subscribers/{app_user_id} we rely on. */
export interface Subscriber {
  entitlements?: Record<string, { expires_date: string | null; product_identifier: string; purchase_date: string }>;
  non_subscriptions?: Record<string, { id: string; purchase_date: string }[]>;
}

export async function fetchSubscriber(appUserId: string, secretKey: string, fetchImpl: typeof fetch = fetch): Promise<Subscriber> {
  const res = await fetchImpl(`${REVENUECAT_API}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { authorization: `Bearer ${secretKey}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
  return ((await res.json()) as { subscriber: Subscriber }).subscriber;
}

/**
 * Derive the entitlement from the RevenueCat customer. Premium credits: one per `mecena_solicitud_premium`
 * transaction bought after the last RevenueCat sync (first sync: all of them), added to the unused credits.
 */
export function entitlementFromSubscriber(appUserId: string, sub: Subscriber, previous: EntitlementState | undefined, now = new Date()): EntitlementState {
  const pro = sub.entitlements?.[ENTITLEMENT_PRO];
  const active = !!pro && (pro.expires_date === null || Date.parse(pro.expires_date) > now.getTime());
  const txs = sub.non_subscriptions?.[PRODUCTS.solicitudPremium] ?? [];
  const since = previous?.source === "revenuecat" ? Date.parse(previous.updatedAt) : -Infinity;
  const fresh = txs.filter((t) => Date.parse(t.purchase_date) > since).length;
  return {
    appUserId,
    pro: active,
    premiumCredits: (previous?.premiumCredits ?? 0) + fresh,
    ...(active ? { activeProductId: pro.product_identifier } : {}),
    ...(active && pro.expires_date ? { expiresAt: pro.expires_date } : {}),
    source: "revenuecat",
    updatedAt: now.toISOString(),
  };
}

/**
 * POST /api/entitlements after a purchase.
 * - Secret key set: re-verify with RevenueCat REST (client claims are ignored).
 * - No secret key: trust the client claim (sandbox demo only, see docs/revenuecat.md). `source` is "revenuecat"
 *   when the claim comes from the RevenueCat SDK (`via: "revenuecat"`), "mock" for the mock adapter.
 */
export async function syncEntitlement(
  input: { appUserId: string; purchasedProductId?: string; pro?: boolean; premiumCredits?: number; via?: "revenuecat" | "mock" },
  fetchImpl: typeof fetch = fetch,
): Promise<EntitlementState> {
  const secret = serverEnv().revenueCatSecretKey;
  if (secret) {
    const stored = readDb().entitlements.find((e) => e.appUserId === input.appUserId);
    const sub = await fetchSubscriber(input.appUserId, secret, fetchImpl);
    return saveEntitlement(entitlementFromSubscriber(input.appUserId, sub, stored));
  }

  const cur = getEntitlement(input.appUserId);
  const next: EntitlementState = { ...cur, source: input.via === "revenuecat" ? "revenuecat" : "mock", updatedAt: nowIso() };
  if (input.purchasedProductId === PRODUCTS.solicitudPremium) next.premiumCredits = cur.premiumCredits + 1;
  else if (input.purchasedProductId === PRODUCTS.proMonthly || input.purchasedProductId === PRODUCTS.proAnnual) {
    next.pro = true;
    next.activeProductId = input.purchasedProductId;
  }
  if (input.pro !== undefined) next.pro = input.pro;
  if (input.premiumCredits !== undefined) next.premiumCredits = input.premiumCredits;
  return saveEntitlement(next);
}
