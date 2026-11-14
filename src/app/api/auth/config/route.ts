// GET -> { signupCodeRequired, signupCodeAccepted }: whether /entrar's invite-code field is mandatory (invite-only
// sign-up) or shown as optional (MECENA_SIGNUP_OPEN=1 while codes exist, so a code can still gift credits).
import { signupCodeAccepted, signupCodeRequired } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ signupCodeRequired: signupCodeRequired(), signupCodeAccepted: signupCodeAccepted() }));
