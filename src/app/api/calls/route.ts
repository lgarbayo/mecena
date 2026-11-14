// Owned by WP-06. Matched calls feed for the user's profile (free plan: FREE_MATCHES_PER_MONTH visible, rest locked).
// Pro comes from the signed-in user's entitlement; an appUserId in the query is ignored.
import { callsFeed } from "@/features/matching/service";
import { requireProfile } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const { user, profile } = await requireProfile(req, sp.get("profileId"));
  return json(await callsFeed({ profileId: profile.id, appUserId: user.appUserId, query: sp.get("q") ?? undefined }));
});
