// GET -> invitations addressed to the signed-in user's email + the organisations that see their profile;
// POST { email } -> the organisation's owner invites someone (nothing is visible until they accept).
import { OrgInviteRequest } from "@/contracts/api";
import { inviteMember, myInvitations } from "@/features/panel/service";
import { requireUser } from "@/server/auth";
import { idempotent } from "@/server/idempotency";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => json(myInvitations(requireUser(req))));

export const POST = route(idempotent(async (req: Request) => {
  const user = requireUser(req);
  const { email } = await body(req, OrgInviteRequest);
  const m = await inviteMember(user, email);
  return json({ id: m.id, email: m.email, invitedAt: m.invitedAt }, { status: 201 });
}));
