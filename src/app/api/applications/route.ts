// Owned by WP-08. "Prepárame la solicitud": 402 payment_required without Pro / Solicitud premium.
// GET ?callId&profileId → the existing draft (or null) so the page never re-drafts or spends a second credit.
// profileId must be one of the user's profiles; entitlement is always the signed-in user's (body appUserId ignored).
import { CreateApplicationRequest } from "@/contracts/api";
import { draftApplication, draftSources, findDraft } from "@/features/drafting/service";
import { requireProfile, requireUser, resolveProfile } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { limitAi } from "@/server/ai-limits";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const { profile } = await requireProfile(req, sp.get("profileId"));
  const application = findDraft({ callId: sp.get("callId") ?? "", profileId: profile.id });
  return json({ application, sources: application ? draftSources(application) : {} });
});

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  limitAi(user, "draft");
  const { callId, profileId } = await body(req, CreateApplicationRequest);
  const profile = await resolveProfile(user, profileId);
  const application = await draftApplication({ callId, profileId: profile.id }, { appUserId: user.appUserId });
  return json({ application, sources: draftSources(application) }, { status: 201 });
});
