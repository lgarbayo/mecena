// Owned by WP-03. Streams the dossier PDF (opens in a new tab on the phone). Never 500s for a known profile:
// renderDossierPdf falls back to a minimal PDF. A call variant is only applied for Pro users; everyone
// else gets the plain (free) dossier. ?estilo and ?accent pick the look (style.ts); both are free.
import { renderDossierPdf } from "@/features/dossier/service";
import { slug } from "@/features/dossier/model";
import { resolveEntitlement } from "@/features/purchases/server";
import { route } from "@/server/http";
import { getProfile } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const profile = getProfile(sp.get("profileId") || undefined);
  const callId = sp.get("callId") || undefined;
  const pro = callId ? (await resolveEntitlement(sp.get("appUserId") || undefined).catch(() => undefined))?.pro === true : false;
  // Look chosen on the page (?estilo) and the accent sampled from the artist's photos (?accent=#rrggbb).
  const accent = /^#[0-9a-f]{6}$/i.test(sp.get("accent") ?? "") ? sp.get("accent") : undefined;
  const bytes = await renderDossierPdf({ profileId: profile.id, callId: pro ? callId : undefined, style: sp.get("estilo"), accent });
  const name = `dossier-${slug(profile.displayName || "mecena")}${pro && callId ? `-${slug(callId)}` : ""}.pdf`;
  const disposition = sp.get("download") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `${disposition}; filename="${name}"`, "cache-control": "no-store" },
  });
});
