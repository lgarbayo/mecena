import { ProfilePatchRequest } from "@/contracts/api";
import { requireProfile, requireUser, resolveProfile } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { patchProfile } from "@/server/store";

export const dynamic = "force-dynamic";

/** GET ?profileId -> the user's profile (default: their active one) and their RevenueCat app user id. */
export const GET = route(async (req: Request) => {
  const { user, profile } = await requireProfile(req, new URL(req.url).searchParams.get("profileId"));
  return json({ profile, appUserId: user.appUserId });
});

export const PATCH = route(async (req: Request) => {
  const user = requireUser(req);
  const { profileId, patch } = await body(req, ProfilePatchRequest);
  const profile = await resolveProfile(user, profileId);
  return json({ profile: await patchProfile(profile.id, patch), appUserId: user.appUserId });
});
