// Owned by WP-09. Resets the signed-in user's own data (never anyone else's) and rotates their RevenueCat app user id.
import { DemoResetRequest } from "@/contracts/api";
import { resetUserDemo } from "@/features/demo/service";
import { requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  return json(await resetUserDemo(user, await body(req, DemoResetRequest)));
});
