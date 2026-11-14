// Free layout ("maquetación libre") of the dossier: the model composes it page by page, no templates.
// GET ?profileId&callId -> LayoutState: what the screen paints, the proposals waiting for a choice, and `busy` while a job runs (poll it).
// POST { auto: "onboarding" | "dossier" } -> the first batch, by itself, once the artist has told enough (no-op when there
//   is nothing new to propose from, a proposal is chosen, a job runs or the budget is used up). The free layout is the first design.
// POST { generate: true } -> starts a batch of N proposals, each with its own art direction (background job; returns at once).
// POST { choose: proposalId } -> the proposal becomes the layout in force.
// POST { request } -> starts one change, in plain language, of the layout in force; on any failure it stays as it was.
// POST { undo: true } -> one step back. POST { enabled } -> switch on/off (off = the template design as always).
// Designing is free for the artist; capped per user (limitAi) and per profile per day. The user always comes from the
// session; profileId only selects among the user's own profiles.
import { z } from "zod";
import { autoProposals, chooseProposal, requestChange, requestProposals, setFreeLayout, undoLayout, layoutState } from "@/features/dossier/layout/service";
import { body, json, route } from "@/server/http";
import { requireProfile, requireUser, resolveProfile } from "@/server/auth";
import { limitAi } from "@/server/ai-limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Post = z.object({
  request: z.string().trim().max(600).optional(),
  enabled: z.boolean().optional(),
  undo: z.boolean().optional(),
  generate: z.boolean().optional(),
  auto: z.enum(["onboarding", "dossier"]).optional(),
  choose: z.string().max(40).optional(),
  profileId: z.string().max(200).optional(),
  callId: z.string().max(200).optional(),
});

export const GET = route(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  const { profile } = await requireProfile(req, sp.get("profileId"));
  return json(await layoutState({ profileId: profile.id, callId: sp.get("callId") || undefined }));
});

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const input = await body(req, Post);
  const profile = await resolveProfile(user, input.profileId);
  if (input.auto) {
    const { started: _started, ...state } = await autoProposals({ profileId: profile.id, from: input.auto, charge: () => limitAi(user, "dossier-layout-batch") });
    return json(state);
  }
  if (input.undo) return json(await undoLayout({ profileId: profile.id }));
  if (input.choose) return json(await chooseProposal({ profileId: profile.id, proposalId: input.choose }));
  if (input.generate) {
    limitAi(user, "dossier-layout-batch");
    return json(await requestProposals({ profileId: profile.id }));
  }
  if (typeof input.enabled === "boolean" && !input.request) return json(await setFreeLayout({ profileId: profile.id, enabled: input.enabled }));
  if (!input.request) return json({ error: "bad_request", message: "Cuéntame cómo quieres tu dossier." }, { status: 400 });
  limitAi(user, "dossier-layout");
  return json(await requestChange({ profileId: profile.id, request: input.request }));
});
