// Owned by WP-03. Streams the dossier PDF (download on the phone).
import { renderDossierPdf } from "@/features/dossier/service";
import { route } from "@/server/http";
import { getProfile } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const profile = getProfile(sp.get("profileId") ?? undefined);
  const bytes = await renderDossierPdf({ profileId: profile.id, callId: sp.get("callId") ?? undefined });
  const name = `dossier-${(profile.displayName || "mecena").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"` } });
});
