// Owned by WP-06. Matched calls feed for the active profile (free plan: FREE_MATCHES_PER_MONTH visible, rest locked).
import { callsFeed } from "@/features/matching/service";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  return json(
    await callsFeed({ profileId: sp.get("profileId") ?? undefined, appUserId: sp.get("appUserId") ?? undefined, query: sp.get("q") ?? undefined }),
  );
});
