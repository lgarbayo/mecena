// Owned by WP-08. "Prepárame la solicitud": 402 payment_required without Pro / Solicitud premium.
import { CreateApplicationRequest } from "@/contracts/api";
import { draftApplication } from "@/features/drafting/service";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const { callId, profileId, appUserId } = await body(req, CreateApplicationRequest);
  return json({ application: await draftApplication({ callId, profileId }, { caller: "app", appUserId }) }, { status: 201 });
});
