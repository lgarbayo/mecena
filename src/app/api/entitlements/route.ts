// Owned by WP-07. GET current entitlement; POST sync after a purchase (RevenueCat REST re-verifies with a secret key).
import { EntitlementSyncRequest } from "@/contracts/api";
import { syncEntitlement, resolveEntitlement } from "@/features/purchases/server";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => json({ entitlement: await resolveEntitlement(new URL(req.url).searchParams.get("appUserId") ?? undefined) }));

export const POST = route(async (req: Request) => {
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const input = EntitlementSyncRequest.parse(raw);
  // `via` (not yet in the contract, see PR): which adapter made the claim, for `source` when no secret key is set
  const via = raw.via === "revenuecat" ? "revenuecat" : "mock";
  return json({ entitlement: await syncEntitlement({ ...input, via }) });
});
