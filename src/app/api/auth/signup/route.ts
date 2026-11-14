// POST { email, password, code? } -> creates the account (+ its first blank profile), signs in (session cookie).
// With MECENA_SIGNUP_CODE set, `code` must match it (invite-only sign-up: AI calls spend the owner's key).
import { createHash, timingSafeEqual } from "node:crypto";
import { ForbiddenError, serverEnv } from "@/contracts";
import { SignupRequest } from "@/contracts/api";
import { activeProfile, createSession, createUser, publicUser, setSessionCookie } from "@/server/auth";
import { consumeAttempt, limitKeys } from "@/server/auth/rate-limit";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

const digest = (s: string) => createHash("sha256").update(s).digest();
const codeMatches = (given: string | undefined, expected: string) => !!given && timingSafeEqual(digest(given), digest(expected));

export const POST = route(async (req: Request) => {
  const input = await body(req, SignupRequest);
  const keys = limitKeys("signup", req, input.email);
  consumeAttempt(keys); // every sign-up attempt counts, before any await
  const expected = serverEnv().signupCode;
  if (expected && !codeMatches(input.code, expected)) throw new ForbiddenError("El código de invitación no es correcto.");
  const user = await createUser(input);
  const token = await createSession(user.id);
  const res = json({ user: publicUser(user), profile: await activeProfile(user), appUserId: user.appUserId }, { status: 201 });
  setSessionCookie(res, token);
  return res;
});
