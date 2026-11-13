// Owned by WP-09. Resets the demo to a known state and rotates the RevenueCat app user id.
import { DemoResetRequest } from "@/contracts/api";
import { resetDemo } from "@/features/demo/service";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => json(await resetDemo(await body(req, DemoResetRequest))));
