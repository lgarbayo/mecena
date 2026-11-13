// Owned by WP-07. GET current entitlement; POST sync after a purchase (mock grants; RevenueCat mode re-verifies via REST).
import { EntitlementSyncRequest } from "@/contracts/api";
import { syncEntitlement, resolveEntitlement } from "@/features/purchases/server";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => json({ entitlement: await resolveEntitlement(new URL(req.url).searchParams.get("appUserId") ?? undefined) }));

export const POST = route(async (req: Request) => json({ entitlement: await syncEntitlement(await body(req, EntitlementSyncRequest)) }));
