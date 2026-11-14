// Owned by WP-03. The dossier's design, written by the design agent from the artist's own words.
// GET ?profileId&callId -> current design (or the starting point that suits the call).
// POST { request, workColors?, preset?, profileId?, callId? } -> new design + what the guard rails changed.
// POST { auto: true, workColors? } -> first design, inferred from the interview (no-op if one is saved).
// POST { undo: true } (or DELETE ?profileId&callId) -> undo one step. Designing is free: it is part of the lead-magnet dossier.
import { z } from "zod";
import { currentDesign, designHistory, requestDesign, undoDesign } from "@/features/dossier/designs";
import { body, json, route } from "@/server/http";
import { idempotent } from "@/server/idempotency";
import { requireProfile, requireUser, resolveProfile } from "@/server/auth";
import { getCall } from "@/server/store";
import { limitAi } from "@/server/ai-limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Post = z.object({
  request: z.string().trim().max(600).default(""),
  workColors: z.array(z.string().max(32)).max(8).optional(),
  preset: z.string().max(64).optional(),
  undo: z.boolean().optional(),
  auto: z.boolean().optional(),
  profileId: z.string().max(200).optional(),
  callId: z.string().max(200).optional(),
});

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const { profile } = await requireProfile(req, sp.get("profileId"));
  const callId = sp.get("callId") || undefined;
  const { design, saved } = currentDesign({
    profile,
    call: callId ? getCall(callId) : undefined,
  });
  return json({ design, saved, history: designHistory(profile.id) });
});

export const POST = route(
  idempotent(async (req: Request) => {
    const user = requireUser(req);
    const input = await body(req, Post);
    const profile = await resolveProfile(user, input.profileId);
    if (input.undo) return json(undoDesign({ profileId: profile.id, callId: input.callId }));
    if (!input.preset && !input.request && !input.auto) return json({ error: "bad_request", message: "Cuéntame cómo quieres tu dossier." }, { status: 400 });
    limitAi(user, "dossier-design");
    return json(await requestDesign({ ...input, profileId: profile.id }));
  }),
);

export const DELETE = route(
  idempotent(async (req: Request) => {
    const sp = new URL(req.url).searchParams;
    const { profile } = await requireProfile(req, sp.get("profileId"));
    return json(
      undoDesign({
        profileId: profile.id,
        callId: sp.get("callId") || undefined,
      }),
    );
  }),
);
