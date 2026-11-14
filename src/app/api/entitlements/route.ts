// Owned by WP-07. GET the signed-in user's entitlement; POST sync after a purchase (RevenueCat REST re-verifies with a
// secret key). Always the user's own app user id: an appUserId in the query/body is ignored.
import { EntitlementSyncRequest } from "@/contracts/api";
import { syncEntitlement, resolveEntitlement } from "@/features/purchases/server";
import { requireUser } from "@/server/auth";
import { json, readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => json({ entitlement: await resolveEntitlement(requireUser(req).appUserId) }));

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const raw = ((await readJson(req)) ?? {}) as Record<string, unknown>;
  const input = EntitlementSyncRequest.parse(raw);
  // `via` (not yet in the contract, see PR): which adapter made the claim, for `source` when no secret key is set
  const via = raw.via === "revenuecat" ? "revenuecat" : "mock";
  return json({ entitlement: await syncEntitlement({ ...input, appUserId: user.appUserId, via }) });
});
