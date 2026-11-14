// POST { email, password, code? } -> creates the account (+ its first blank profile), signs in (session cookie).
// With MECENA_SIGNUP_CODE set, `code` must match it (invite-only sign-up: AI calls spend the owner's key).
import { createHash, timingSafeEqual } from "node:crypto";
import { ForbiddenError, serverEnv } from "@/contracts";
import { SignupRequest } from "@/contracts/api";
import { activeProfile, createSession, createUser, publicUser, setSessionCookie } from "@/server/auth";
import { consumeLimits, limitKeys, refundAttempt } from "@/server/auth/rate-limit";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

const digest = (s: string) => createHash("sha256").update(s).digest();
const codeMatches = (given: string | undefined, expected: string) => !!given && timingSafeEqual(digest(given), digest(expected));

export const POST = route(async (req: Request) => {
  const input = await body(req, SignupRequest);
  const keys = limitKeys("signup", req, input.email);
  // Counted before any await (wrong invite codes and taken emails use up the window); a sign-up that works is given back,
  // so a room full of people creating accounts from the venue Wi-Fi never hits the per-IP limit.
  const attempt = consumeLimits(keys);
  const expected = serverEnv().signupCode;
  if (expected && !codeMatches(input.code, expected)) throw new ForbiddenError("El código de invitación no es correcto.");
  const user = await createUser(input);
  refundAttempt(keys, attempt);
  const token = await createSession(user.id);
  const res = json({ user: publicUser(user), profile: await activeProfile(user), appUserId: user.appUserId }, { status: 201 });
  setSessionCookie(res, token);
  return res;
});
