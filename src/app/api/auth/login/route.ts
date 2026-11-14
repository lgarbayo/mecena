// POST { email, password } -> session cookie. One generic message on failure (never says whether the email exists).
import { UnauthorizedError } from "@/contracts";
import { LoginRequest } from "@/contracts/api";
import { activeProfile, authenticate, createSession, publicUser, setSessionCookie } from "@/server/auth";
import { consumeAttempt, limitKeys, refundAttempt } from "@/server/auth/rate-limit";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

const LOGIN_FAILED = "Email o contraseña incorrectos.";

export const POST = route(async (req: Request) => {
  const { email, password } = await body(req, LoginRequest);
  const keys = limitKeys("login", req, email);
  // Counted before the (slow, async) password check: parallel guesses cannot all slip under the limit.
  const attempt = consumeAttempt(keys);
  const user = await authenticate(email, password);
  if (!user) throw new UnauthorizedError(LOGIN_FAILED);
  refundAttempt(keys, attempt);
  const token = await createSession(user.id);
  const res = json({ user: publicUser(user), profile: await activeProfile(user), appUserId: user.appUserId });
  setSessionCookie(res, token);
  return res;
});
