// POST -> deletes this session and clears the cookie. Always 200 (logging out twice is fine).
import { clearSessionCookie, deleteSession, readSessionToken } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  await deleteSession(readSessionToken(req));
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
});
