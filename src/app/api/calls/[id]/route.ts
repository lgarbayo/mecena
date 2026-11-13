// Owned by WP-06. Call detail: plain-language bases, fit, checklist, similar past awards.
import { explainCall } from "@/features/matching/service";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const profileId = new URL(req.url).searchParams.get("profileId") ?? undefined;
  return json({ ...(await explainCall({ callId: (await params).id, profileId })), similarAwards: [] }); // TODO(WP-06): similarAwards
});
