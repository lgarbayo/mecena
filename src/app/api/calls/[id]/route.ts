// Owned by WP-06. Call detail: plain-language bases, fit, score breakdown, checklist, similar past awards.
// The fit is computed for one of the user's profiles (?profileId, default: the active one).
import { callDetail } from "@/features/matching/service";
import { requireProfile } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { profile } = await requireProfile(req, new URL(req.url).searchParams.get("profileId"));
  return json(await callDetail({ callId: (await params).id, profileId: profile.id }));
});
