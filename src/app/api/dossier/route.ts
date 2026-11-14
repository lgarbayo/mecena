// Owned by WP-03. GET ?profileId&callId -> DossierResponse (+ call, adapted). profileId: one of the user's profiles.
// The call variant is Pro: without the `pro` entitlement the response keeps the plain ordering and only
// carries `dossier.variant.notes` as a preview. The plain dossier is always free.
import { loadDossierData } from "@/features/dossier/service";
import { resolveEntitlement } from "@/features/purchases/server";
import { requireProfile } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const { user, profile } = await requireProfile(req, sp.get("profileId"));
  const callId = sp.get("callId") || undefined;
  const pro = callId ? (await resolveEntitlement(user.appUserId)).pro : false;
  const data = await loadDossierData({ profileId: profile.id, callId, adapt: pro });
  return json({ dossier: data.dossier, profile: data.profile, works: data.works, call: data.call, adapted: !!callId && pro });
});
