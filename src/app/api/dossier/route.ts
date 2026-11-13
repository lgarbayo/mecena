// Owned by WP-03.
import { buildDossier } from "@/features/dossier/service";
import { json, route } from "@/server/http";
import { getProfile, listWorks } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const dossier = await buildDossier({ profileId: sp.get("profileId") ?? undefined, callId: sp.get("callId") ?? undefined });
  const works = listWorks(dossier.profileId).filter((w) => dossier.workIds.includes(w.id));
  return json({ dossier, profile: getProfile(dossier.profileId), works });
});
