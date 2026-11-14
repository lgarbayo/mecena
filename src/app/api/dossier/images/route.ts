// Owned by WP-03. GET ?profileId&callId -> ZIP of the artist's original photos (confirmed works; the call's order
// and image limit when there is a call), for calls that ask for loose image files instead of a dossier PDF.
// Only the owner (session) gets them. Free: they are the artist's own photos.
import { dossierImages } from "@/features/dossier/service";
import { slug } from "@/features/dossier/model";
import { zipStore } from "@/features/dossier/zip";
import { requireProfile } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const { profile } = await requireProfile(req, sp.get("profileId"));
  const files = await dossierImages({ profileId: profile.id, callId: sp.get("callId") || undefined });
  if (!files.length) return json({ error: "not_found", message: "Aún no tienes fotos confirmadas que descargar." }, { status: 404 });
  const zip = zipStore(files.map((f) => ({ name: f.name, data: f.data })));
  const name = `fotos-${slug(profile.displayName || "mecena")}.zip`;
  return new Response(new Uint8Array(zip), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
});
