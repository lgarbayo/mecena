// Owned by WP-03. The dossier's design, written by the design agent from the artist's own words.
// GET ?profileId&callId -> current design (or the starting point that suits the call).
// POST { request, workColors?, preset?, profileId?, callId? } -> new design + what the guard rails changed.
// POST { undo: true } (or DELETE ?profileId&callId) -> undo one step. Designing is free: it is part of the lead-magnet dossier.
import { z } from "zod";
import { currentDesign, designHistory, requestDesign, undoDesign } from "@/features/dossier/designs";
import { body, json, route } from "@/server/http";
import { getCall, getProfile } from "@/server/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Post = z.object({
  request: z.string().trim().max(600).default(""),
  workColors: z.array(z.string()).max(8).optional(),
  preset: z.string().optional(),
  undo: z.boolean().optional(),
  profileId: z.string().optional(),
  callId: z.string().optional(),
});

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const profile = getProfile(sp.get("profileId") || undefined);
  const callId = sp.get("callId") || undefined;
  const { design, saved } = currentDesign({ profile, call: callId ? getCall(callId) : undefined });
  return json({ design, saved, history: designHistory(profile.id) });
});

export const POST = route(async (req: Request) => {
  const input = await body(req, Post);
  if (input.undo) return json(undoDesign({ profileId: input.profileId, callId: input.callId }));
  if (!input.preset && !input.request) return json({ error: "bad_request", message: "Cuéntame cómo quieres tu dossier." }, { status: 400 });
  return json(await requestDesign(input));
});

export const DELETE = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  return json(undoDesign({ profileId: sp.get("profileId") || undefined, callId: sp.get("callId") || undefined }));
});
