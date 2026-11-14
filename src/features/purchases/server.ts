// Owned by WP-07. Entitlements on the server: every gate (drafts, jury, feed, dossier variant) trusts only what is
// stored here, and nothing in it comes from a client claim.
// - REVENUECAT_SECRET_API_KEY set: every sync reads the customer from RevenueCat REST (GET /v1/subscribers/{id}).
// - No secret: only the explicit mock build outside production (NEXT_PUBLIC_PURCHASES_MOCK=1, dev and tests) grants a
//   simulated purchase, from the product id. Anywhere else purchase claims are refused and logged.
import {
  canDraft,
  JURY_RUNS_PER_APPLICATION,
  PaymentRequiredError,
  PRODUCTS,
  publicEnv,
  serverEnv,
  type Db,
  type EntitlementState,
} from "@/contracts";
import { nowIso, readDb, updateDb } from "@/server/store";

export const REVENUECAT_API = "https://api.revenuecat.com/v1";

/** Marker the server-side demo scenario (src/features/demo) uses for the Pro it grants: never re-verified or expired. */
export const DEMO_PRODUCT_ID = "demo";

/** Purchases cannot be verified right now (no secret key in production, or RevenueCat unreachable). HTTP 503. */
export class PurchaseVerificationError extends Error {
  constructor(message = "No hemos podido comprobar tu compra ahora mismo. Pulsa «Restaurar compras» en un momento.") {
    super(message);
    this.name = "PurchaseVerificationError";
  }
}

/** How purchases are verified in this process. */
export function verificationMode(): "revenuecat" | "mock" | "disabled" {
  if (serverEnv().revenueCatSecretKey) return "revenuecat";
  // Literal access so Next inlines it in the server bundle too; unset at runtime means "not mock" (fails closed).
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PURCHASES_MOCK === "1") return "mock";
  return "disabled";
}

const blank = (appUserId: string): EntitlementState => ({ appUserId, pro: false, premiumCredits: 0, premiumUsed: 0, source: "mock", updatedAt: nowIso() });

/** Pro right now: a stored Pro whose expiresAt has passed is not Pro any more. */
export function isProActive(e: Pick<EntitlementState, "pro" | "expiresAt">, now = Date.now()): boolean {
  return e.pro && (!e.expiresAt || Date.parse(e.expiresAt) > now);
}

const isDemoGrant = (e: EntitlementState | undefined) => e?.activeProductId === DEMO_PRODUCT_ID;

/**
 * Whether a stored state may grant anything: verified with RevenueCat, granted by the server-side demo scenario, or
 * any state in the explicit mock mode. A record written from a client claim before server verification existed is
 * worth nothing until RevenueCat confirms it.
 */
function trusted(e: EntitlementState): boolean {
  return !!e.verifiedAt || isDemoGrant(e) || verificationMode() === "mock";
}

/** The stored state as callers and gates must see it: untrusted grants dropped, an expired Pro is not Pro. */
function view(e: EntitlementState): EntitlementState {
  if (!trusted(e)) return { ...e, pro: false, premiumCredits: 0 };
  return isProActive(e) ? e : { ...e, pro: false };
}

const findIn = (db: Db, appUserId: string) => db.entitlements.find((e) => e.appUserId === appUserId);
function upsert(db: Db, e: EntitlementState): EntitlementState {
  const i = db.entitlements.findIndex((x) => x.appUserId === e.appUserId);
  if (i < 0) db.entitlements.push(e);
  else db.entitlements[i] = e;
  return e;
}

/** After the subscription period ends, keep asking RevenueCat (at most once a minute) for this long: renewal lag. */
const RENEWAL_GRACE_MS = 24 * 3600e3;
const RECHECK_MS = 60e3;
/** After a failed RevenueCat call, lazy re-syncs pause this long so gated requests do not each wait for a timeout. */
const FAILURE_PAUSE_MS = 30e3;
const lastFailure = new Map<string, number>();
/** Tests: forget in-memory RevenueCat failures. */
export function resetPurchaseSyncState() {
  lastFailure.clear();
}
const paused = (appUserId: string) => Date.now() - (lastFailure.get(appUserId) ?? -Infinity) < FAILURE_PAUSE_MS;

/** Whether the stored state should be re-read from RevenueCat before trusting it. */
function needsResync(e: EntitlementState | undefined, now = Date.now()): boolean {
  if (!e || isDemoGrant(e)) return false;
  if (!e.verifiedAt) return e.pro || e.premiumCredits > 0; // a client claim from before verification: verify once
  if (!e.expiresAt) return false;
  const expires = Date.parse(e.expiresAt);
  if (expires > now) return false;
  const verified = Date.parse(e.verifiedAt);
  if (verified < expires) return true; // the period ended since we last looked: renewed or not?
  return now - expires < RENEWAL_GRACE_MS && now - verified > RECHECK_MS; // a renewal may still be on its way
}

/**
 * The entitlement of this RevenueCat app user id (always the signed-in user's own, resolved on the server).
 * With the secret key it re-syncs lazily when the stored Pro has expired or was never verified; `refresh` forces it.
 * A failed lazy re-sync falls back to the stored state (an expired Pro stays expired).
 */
export async function resolveEntitlement(appUserId: string, opts: { refresh?: boolean } = {}): Promise<EntitlementState> {
  const stored = findIn(readDb(), appUserId);
  const mode = verificationMode();
  if (opts.refresh && mode === "disabled") {
    console.error("[purchases] Cannot restore purchases: REVENUECAT_SECRET_API_KEY is not set (see docs/revenuecat.md).");
    throw new PurchaseVerificationError();
  }
  if (mode === "revenuecat" && (opts.refresh || (needsResync(stored) && !paused(appUserId)))) {
    try {
      return view(await syncFromRevenueCat(appUserId));
    } catch (e) {
      if (opts.refresh) throw e;
      console.error(`[purchases] lazy RevenueCat re-sync failed for ${appUserId}:`, e);
    }
  }
  // a failed re-sync falls back to the stored state, minus anything never verified (see view)
  return view(stored ?? blank(appUserId));
}

/** Throws PaymentRequiredError unless the user is Pro or has a Solicitud premium credit (read only). */
export async function requireDraftEntitlement(appUserId: string): Promise<EntitlementState> {
  const e = await resolveEntitlement(appUserId);
  if (!canDraft(e)) throw new PaymentRequiredError();
  return e;
}

export interface DraftReservation {
  /** True when a premium credit was taken (false for Pro). */
  usedCredit: boolean;
  /** Give the credit back (the draft failed). Safe to call more than once. */
  refund(): Promise<void>;
}

/**
 * Reserve the right to draft BEFORE calling the AI: Pro passes; otherwise one premium credit is taken atomically
 * (inside the serialised updateDb), so two concurrent drafts can never share one credit. Refund it if drafting fails.
 * When nothing is stored as paid and the secret key is set, RevenueCat is asked once first, so a purchase whose sync
 * failed still unlocks the draft.
 */
export async function reserveDraftCredit(appUserId: string): Promise<DraftReservation> {
  const e = await resolveEntitlement(appUserId);
  if (!canDraft(e) && verificationMode() === "revenuecat" && !paused(appUserId)) await syncFromRevenueCat(appUserId).catch(() => undefined);
  const usedCredit = await updateDb((db) => {
    const cur = findIn(db, appUserId);
    const now = cur && view(cur);
    if (now?.pro) return false;
    if (!cur || !now || now.premiumCredits <= 0) throw new PaymentRequiredError(); // never spends an unverified credit
    upsert(db, { ...cur, premiumCredits: cur.premiumCredits - 1, premiumUsed: (cur.premiumUsed ?? 0) + 1, updatedAt: nowIso() });
    return true;
  });
  let refunded = false;
  return {
    usedCredit,
    async refund() {
      if (!usedCredit || refunded) return;
      refunded = true;
      await updateDb((db) => {
        const cur = findIn(db, appUserId);
        if (cur) upsert(db, { ...cur, premiumCredits: cur.premiumCredits + 1, premiumUsed: Math.max(0, (cur.premiumUsed ?? 0) - 1), updatedAt: nowIso() });
      });
    },
  };
}

/** Jury runs left for this application without Pro (Infinity with Pro). */
export function juryRunsLeft(e: EntitlementState, applicationId: string): number {
  if (view(e).pro) return Infinity;
  return Math.max(0, JURY_RUNS_PER_APPLICATION - (e.juryRuns?.[applicationId] ?? 0));
}

/**
 * The simulated jury (and "Aplicar mejoras") is Pro; without Pro, each application (which was unlocked with a
 * Solicitud premium credit to exist at all) includes JURY_RUNS_PER_APPLICATION runs. The run is counted atomically
 * before `fn` (the AI) and given back if it throws. The caller must already have checked the application is the user's.
 */
export async function withJuryRun<T>(appUserId: string, applicationId: string, fn: () => Promise<T>): Promise<T> {
  await resolveEntitlement(appUserId); // lazy expiry / re-sync
  const counted = await updateDb((db) => {
    const cur = findIn(db, appUserId) ?? blank(appUserId);
    if (view(cur).pro) return false;
    const runs = cur.juryRuns?.[applicationId] ?? 0;
    if (runs >= JURY_RUNS_PER_APPLICATION)
      throw new PaymentRequiredError(`Tu solicitud premium incluye ${JURY_RUNS_PER_APPLICATION} pasadas por el tribunal y ya las has usado. Con Mecena Pro, sin límite.`);
    // updatedAt is left alone: legacy credit accounting (legacyUsed) depends on it
    upsert(db, { ...cur, juryRuns: { ...cur.juryRuns, [applicationId]: runs + 1 } });
    return true;
  });
  try {
    return await fn();
  } catch (e) {
    if (counted)
      await updateDb((db) => {
        const cur = findIn(db, appUserId);
        const runs = cur?.juryRuns?.[applicationId] ?? 0;
        if (cur && runs > 0) upsert(db, { ...cur, juryRuns: { ...cur.juryRuns, [applicationId]: runs - 1 } });
      });
    throw e;
  }
}

/** Subset of GET /v1/subscribers/{app_user_id} we rely on. */
export interface Subscriber {
  entitlements?: Record<string, { expires_date: string | null; product_identifier: string; purchase_date: string }>;
  non_subscriptions?: Record<string, { id: string; purchase_date: string }[]>;
}

export async function fetchSubscriber(appUserId: string, secretKey: string, fetchImpl: typeof fetch = fetch): Promise<Subscriber> {
  const res = await fetchImpl(`${REVENUECAT_API}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { authorization: `Bearer ${secretKey}`, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
  return ((await res.json()) as { subscriber: Subscriber }).subscriber;
}

/**
 * Credits already spent by a state written before `premiumUsed` existed: under the old "count purchases since the
 * last sync" scheme, credits = purchases known at that sync - used. A claimed (never paid) credit cannot survive this.
 */
function legacyUsed(previous: EntitlementState, txs: { id: string; purchase_date: string }[]): number {
  const known = new Set(txs.filter((t) => Date.parse(t.purchase_date) <= Date.parse(previous.updatedAt)).map((t) => t.id)).size;
  return Math.max(0, known - previous.premiumCredits);
}

/**
 * Derive the entitlement from the RevenueCat customer. Premium credits = the customer's unique
 * `mecena_solicitud_premium` transactions minus the ones already spent on drafts (`premiumUsed`, kept in our db).
 * A demo grant (server-side demo scenario) keeps its Pro; only its credits follow RevenueCat.
 */
export function entitlementFromSubscriber(appUserId: string, sub: Subscriber, previous: EntitlementState | undefined, now = new Date(), entitlementId = publicEnv().entitlementId): EntitlementState {
  // the dashboard identifier (NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID; ours is "mecena_pro")
  const pro = sub.entitlements?.[entitlementId];
  const active = !!pro && (pro.expires_date === null || Date.parse(pro.expires_date) > now.getTime());
  const txs = sub.non_subscriptions?.[PRODUCTS.solicitudPremium] ?? [];
  const purchased = new Set(txs.map((t) => t.id)).size;
  const used = previous ? (previous.premiumUsed ?? legacyUsed(previous, txs)) : 0;
  const demo = isDemoGrant(previous);
  return {
    appUserId,
    pro: active || demo,
    premiumCredits: Math.max(0, purchased - used),
    premiumUsed: used,
    ...(demo ? { activeProductId: DEMO_PRODUCT_ID } : active ? { activeProductId: pro.product_identifier } : {}),
    // kept after it lapses too, so reads keep asking for a renewal for a while (needsResync)
    ...(!demo && pro?.expires_date ? { expiresAt: pro.expires_date } : {}),
    ...(previous?.juryRuns ? { juryRuns: previous.juryRuns } : {}),
    verifiedAt: now.toISOString(),
    source: "revenuecat",
    updatedAt: now.toISOString(),
  };
}

const syncing = new Map<string, Promise<EntitlementState>>();

/** Read the customer from RevenueCat and store the derived entitlement (concurrent calls share one request). */
export async function syncFromRevenueCat(appUserId: string, fetchImpl: typeof fetch = fetch): Promise<EntitlementState> {
  const secret = serverEnv().revenueCatSecretKey;
  if (!secret) throw new PurchaseVerificationError();
  const running = syncing.get(appUserId);
  if (running) return running;
  const job = (async () => {
    const sub = await fetchSubscriber(appUserId, secret, fetchImpl).catch((e: unknown) => {
      lastFailure.set(appUserId, Date.now());
      throw e;
    });
    lastFailure.delete(appUserId);
    // derive inside updateDb so a credit reserved meanwhile (premiumUsed) is never lost
    return updateDb((db) => upsert(db, entitlementFromSubscriber(appUserId, sub, findIn(db, appUserId))));
  })();
  syncing.set(appUserId, job);
  try {
    return await job;
  } finally {
    syncing.delete(appUserId);
  }
}

/**
 * POST /api/entitlements: after a purchase, or "Restaurar compras" (`refresh`).
 * - Secret key: re-read the customer from RevenueCat REST; whatever the client says is ignored.
 * - Explicit mock build outside production: grant the simulated purchase of `purchasedProductId` (dev, tests).
 * - Otherwise: refuse to grant anything (logged); a refresh just returns the stored state.
 */
export async function syncEntitlement(
  input: { appUserId: string; purchasedProductId?: string; refresh?: boolean; via?: "revenuecat" | "mock" },
  fetchImpl: typeof fetch = fetch,
): Promise<EntitlementState> {
  const mode = verificationMode();
  if (mode === "revenuecat") {
    try {
      return view(await syncFromRevenueCat(input.appUserId, fetchImpl));
    } catch (e) {
      console.error(`[purchases] RevenueCat sync failed for ${input.appUserId}:`, e);
      throw new PurchaseVerificationError();
    }
  }

  const product = input.purchasedProductId;
  if (mode === "disabled") {
    if (product) {
      console.error(
        `[purchases] Refusing an unverified purchase claim (${product}) for ${input.appUserId}: REVENUECAT_SECRET_API_KEY is not set ` +
          "and this is not an explicit mock build. Set it with `fly secrets set REVENUECAT_SECRET_API_KEY=sk_...` (see docs/revenuecat.md).",
      );
      throw new PurchaseVerificationError();
    }
    return resolveEntitlement(input.appUserId, { refresh: input.refresh }); // a refresh cannot verify: 503
  }

  // explicit mock mode: the simulated purchase of a known product, never an arbitrary pro / credits claim
  if (!product) return resolveEntitlement(input.appUserId);
  return view(
    await updateDb((db) => {
      const cur = findIn(db, input.appUserId) ?? blank(input.appUserId);
      const next: EntitlementState = { ...cur, source: input.via === "revenuecat" ? "revenuecat" : "mock", updatedAt: nowIso() };
      if (product === PRODUCTS.solicitudPremium) next.premiumCredits = cur.premiumCredits + 1;
      else if (product === PRODUCTS.proMonthly || product === PRODUCTS.proAnnual) {
        next.pro = true;
        next.activeProductId = product;
        delete next.expiresAt;
      }
      return upsert(db, next);
    }),
  );
}
