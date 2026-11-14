// Pro deep research ("Busca más para mí"): GET the profile's last run and its results, POST start one in the background.
// Whose it is comes from the session: the profile must be the signed-in user's (404 otherwise, existence not leaked)
// and Pro is that user's own entitlement; an appUserId sent by the client is ignored.
import { DeepResearchRequest } from "@/contracts/api";
import { getDeepResearch, startDeepResearch } from "@/features/deep-research/service";
import { requireProfile } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { limitAi } from "@/server/ai-limits";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const { user, profile } = await requireProfile(req, new URL(req.url).searchParams.get("profileId"));
  return json(await getDeepResearch({ profileId: profile.id, appUserId: user.appUserId, userId: user.id }));
});

export const POST = route(async (req: Request) => {
  const input = await body(req, DeepResearchRequest); // JSON only, same-site (CSRF guard)
  const { user, profile } = await requireProfile(req, input.profileId);
  limitAi(user, "deep-research");
  const { view } = await startDeepResearch({ profileId: profile.id, appUserId: user.appUserId, userId: user.id });
  return json(view, { status: view.status === "running" ? 202 : 200 });
});
