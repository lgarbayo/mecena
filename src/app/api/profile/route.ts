import { ProfilePatchRequest } from "@/contracts/api";
import { body, json, route } from "@/server/http";
import { getMeta, getProfile, patchProfile } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("profileId") ?? undefined;
  return json({ profile: getProfile(id), appUserId: getMeta().appUserId });
});

export const PATCH = route(async (req: Request) => {
  const { profileId, patch } = await body(req, ProfilePatchRequest);
  return json({ profile: await patchProfile(profileId, patch), appUserId: getMeta().appUserId });
});
