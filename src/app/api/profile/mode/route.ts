import { ProfileModeRequest } from "@/contracts/api";
import { requireUser, switchMode } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

/** Mode switch in the header: the user's own creator/business profile (a blank one is created the first time). */
export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const { kind } = await body(req, ProfileModeRequest);
  return json({ profile: await switchMode(user.id, kind), appUserId: user.appUserId });
});
