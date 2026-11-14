// Owned by WP-09. The signed-in account's plan-B switches (GET status, POST change). Harmless: no AI, no data reset.
import { DemoSettingsRequest } from "@/contracts/api";
import { demoStatus } from "@/features/demo/status";
import { setDemoSettings } from "@/features/demo/settings";
import { requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { idempotent } from "@/server/idempotency";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req: Request) => json(await demoStatus(requireUser(req))));

export const POST = route(
  idempotent(async (req: Request) => {
    const user = requireUser(req);
    setDemoSettings(user.id, await body(req, DemoSettingsRequest));
    return json(await demoStatus(user));
  }),
);
