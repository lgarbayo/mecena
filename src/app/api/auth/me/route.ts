// GET -> { user: { id, email }, profile, appUserId } for the signed-in user, or 401.
import { activeProfile, publicUser, requireUser } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const user = requireUser(req);
  return json({ user: publicUser(user), profile: await activeProfile(user), appUserId: user.appUserId });
});
