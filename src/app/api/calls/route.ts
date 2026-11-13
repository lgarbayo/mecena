// Owned by WP-06. Matched calls feed for the active profile (free plan: FREE_MATCHES_PER_MONTH visible, rest locked).
import { searchCalls } from "@/features/matching/service";
import { json, route } from "@/server/http";
import { getProfile } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const profile = getProfile(sp.get("profileId") ?? undefined);
  const results = await searchCalls({ profileId: profile.id, query: sp.get("q") ?? undefined });
  return json({ results, lockedCount: 0, mode: profile.kind }); // TODO(WP-06): free-plan limit -> lockedCount
});
