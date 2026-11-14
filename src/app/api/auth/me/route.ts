// GET -> { user: { id, email }, profile, appUserId } for the signed-in user, or 401.
// DELETE { confirm: true } -> deletes the account and everything it owns (photos on disk included), signs out.
import { z } from "zod";
import { deleteAccount } from "@/features/account/service";
import { activeProfile, clearSessionCookie, publicUser, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const user = requireUser(req);
  return json({ user: publicUser(user), profile: await activeProfile(user), appUserId: user.appUserId });
});

/** An explicit confirmation in a JSON body: also keeps the CSRF guard of body() (same-site, application/json). */
const DeleteAccountRequest = z.object({ confirm: z.literal(true, "Confirma que quieres borrar tu cuenta.") });

export const DELETE = route(async (req: Request) => {
  const user = requireUser(req);
  await body(req, DeleteAccountRequest);
  await deleteAccount(user);
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
});
