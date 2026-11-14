// GET -> { signupCodeRequired }: lets /entrar show the invite-code field only when sign-up is invite-only (MECENA_SIGNUP_CODE or invite codes in the db).
import { signupCodeRequired } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ signupCodeRequired: signupCodeRequired() }));
