// POST { email, password, code? } -> creates the account (+ its first blank profile), signs in (session cookie).
// Invite-only when MECENA_SIGNUP_CODE is set or invite codes exist (`npm run invite`): `code` must match one (AI calls
// spend the owner's key). With MECENA_SIGNUP_OPEN=1 the code is optional. A db code is consumed, tags the account with
// its cohort and may gift premium credits.
import { SignupRequest } from "@/contracts/api";
import { activeProfile, checkSignupCode, createSession, createUser, publicUser, setSessionCookie } from "@/server/auth";
import { consumeLimits, limitKeys, refundAttempt } from "@/server/auth/rate-limit";
import { body, json, route } from "@/server/http";
import { idempotent } from "@/server/idempotency";

export const dynamic = "force-dynamic";

export const POST = route(
  idempotent(async (req: Request) => {
    const input = await body(req, SignupRequest);
    const keys = limitKeys("signup", req, input.email);
    // Counted before any await (wrong invite codes and taken emails use up the window); a sign-up that works is given back,
    // so a room full of people creating accounts from the venue Wi-Fi never hits the per-IP limit.
    const attempt = consumeLimits(keys);
    const invite = checkSignupCode(input.code);
    const user = await createUser({ ...input, invite });
    refundAttempt(keys, attempt);
    const token = await createSession(user.id);
    const res = json({ user: publicUser(user), profile: await activeProfile(user), appUserId: user.appUserId }, { status: 201 });
    setSessionCookie(res, token);
    return res;
  }),
);
