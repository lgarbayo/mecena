// PATCH { profileId? }: the invitee accepts, sharing one of their own profiles with the organisation.
// DELETE: decline, leave, or (the organisation's owner) withdraw an invitation / remove a member. Anyone else: 404.
import { OrgAcceptRequest } from "@/contracts/api";
import { acceptInvitation, endMembership } from "@/features/panel/service";
import { requireUser } from "@/server/auth";
import { idempotent } from "@/server/idempotency";
import { body, json, readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(idempotent(async (req: Request, ctx: Ctx) => {
  const user = requireUser(req);
  const { profileId } = await body(req, OrgAcceptRequest);
  const m = await acceptInvitation(user, (await ctx.params).id, profileId);
  return json({ id: m.id, status: m.status });
}));

export const DELETE = route(idempotent(async (req: Request, ctx: Ctx) => {
  const user = requireUser(req);
  await readJson(req); // same cross-site guard as every other mutating route
  await endMembership(user, (await ctx.params).id);
  return json({ ok: true });
}));
