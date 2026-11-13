// Owned by WP-06. Call detail: plain-language bases, fit, score breakdown, checklist, similar past awards.
import { callDetail } from "@/features/matching/service";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profileId = new URL(req.url).searchParams.get("profileId") ?? undefined;
  return json(await callDetail({ callId: (await params).id, profileId }));
});
