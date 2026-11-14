// POST { email, password, kind? } -> session cookie; kind (chosen on the first screen) becomes the active profile. One generic message on failure (never says whether the email exists).
import { UnauthorizedError } from "@/contracts";
import { LoginRequest } from "@/contracts/api";
import { activeProfile, authenticate, createSession, publicUser, setSessionCookie, switchMode } from "@/server/auth";
import { consumeLimits, limitKeys, refundAttempt } from "@/server/auth/rate-limit";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

const LOGIN_FAILED = "Email o contraseña incorrectos.";

export const POST = route(async (req: Request) => {
  const { email, password, kind } = await body(req, LoginRequest);
  const keys = limitKeys("login", req, email);
  // Counted before the (slow, async) password check: parallel guesses cannot all slip under the limit. Per email from
  // this IP (wrong guesses elsewhere cannot lock the account) and per IP (high: a venue shares one NAT address).
  const attempt = consumeLimits(keys);
  const user = await authenticate(email, password);
  if (!user) throw new UnauthorizedError(LOGIN_FAILED);
  refundAttempt(keys, attempt);
  const token = await createSession(user.id);
  const profile = kind ? await switchMode(user.id, kind) : await activeProfile(user);
  const res = json({ user: publicUser(user), profile, appUserId: user.appUserId });
  setSessionCookie(res, token);
  return res;
});
