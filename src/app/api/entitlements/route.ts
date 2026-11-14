// Owned by WP-07. GET the signed-in user's entitlement (?refresh=1 re-reads it from RevenueCat); POST after a purchase
// or for "Restaurar compras" ({ refresh: true }). Always the user's own app user id: an appUserId in the query/body is
// ignored, and so is any pro / premiumCredits claim (see syncEntitlement).
import { NextResponse } from "next/server";
import { EntitlementSyncRequest } from "@/contracts/api";
import { PurchaseVerificationError, resolveEntitlement, syncEntitlement } from "@/features/purchases/server";
import { requireUser } from "@/server/auth";
import { json, readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";

/** 503 with a Spanish message the paywall shows as is; any other error goes through route(). */
function unavailable(e: unknown): Response {
  if (e instanceof PurchaseVerificationError) return NextResponse.json({ error: "purchase_unverified", message: e.message }, { status: 503 });
  throw e;
}

export const GET = route(async (req: Request) => {
  const user = requireUser(req);
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    return json({ entitlement: await resolveEntitlement(user.appUserId, { refresh }) });
  } catch (e) {
    return unavailable(e instanceof PurchaseVerificationError ? e : refresh ? new PurchaseVerificationError() : e);
  }
});

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const raw = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const input = EntitlementSyncRequest.parse(raw);
  // `via`: which client adapter made the purchase (only labels `source` in the explicit mock mode)
  const via = raw.via === "revenuecat" ? "revenuecat" : "mock";
  try {
    return json({ entitlement: await syncEntitlement({ ...input, appUserId: user.appUserId, via }) });
  } catch (e) {
    return unavailable(e);
  }
});
