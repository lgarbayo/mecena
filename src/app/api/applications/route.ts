// Owned by WP-08. "Prepárame la solicitud": 402 payment_required without Pro / Solicitud premium.
// GET ?callId&profileId → the existing draft (or null) so the page never re-drafts or spends a second credit.
import { CreateApplicationRequest } from "@/contracts/api";
import { draftApplication, draftSources, findDraft } from "@/features/drafting/service";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const application = findDraft({ callId: sp.get("callId") ?? "", profileId: sp.get("profileId") ?? undefined });
  return json({ application, sources: application ? draftSources(application) : {} });
});

export const POST = route(async (req: Request) => {
  const { callId, profileId, appUserId } = await body(req, CreateApplicationRequest);
  const application = await draftApplication({ callId, profileId }, { caller: "app", appUserId });
  return json({ application, sources: draftSources(application) }, { status: 201 });
});
