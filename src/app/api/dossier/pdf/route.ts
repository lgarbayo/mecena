// Owned by WP-03. Streams the dossier PDF (opens in a new tab on the phone). Never 500s for a known profile:
// renderDossierPdf falls back to a minimal PDF. A call variant is only applied for Pro users; everyone
// else gets the plain (free) dossier. The design (design agent) is free.
import { renderDossierPdf } from "@/features/dossier/service";
import { slug } from "@/features/dossier/model";
import { resolveEntitlement } from "@/features/purchases/server";
import { route } from "@/server/http";
import { requireProfile } from "@/server/auth";
import { limitAi } from "@/server/ai-limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  // Only the owner gets the PDF (the link carries a profileId, but without the owner's session it is a 401/404).
  const { user, profile } = await requireProfile(req, sp.get("profileId"));
  const callId = sp.get("callId") || undefined;
  const pro = callId ? (await resolveEntitlement(user.appUserId).catch(() => undefined))?.pro === true : false;
  if (callId && pro) limitAi(user, "dossier-variant"); // the call variant is written by Claude (cached)
  // The design comes from the design agent (saved per profile); ?estilo forces a starting point.
  const bytes = await renderDossierPdf({ profileId: profile.id, callId: pro ? callId : undefined, style: sp.get("estilo") });
  const name = `dossier-${slug(profile.displayName || "mecena")}${pro && callId ? `-${slug(callId)}` : ""}.pdf`;
  const disposition = sp.get("download") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `${disposition}; filename="${name}"`, "cache-control": "no-store" },
  });
});
