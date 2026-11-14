// GET -> { signupCodeRequired }: lets /entrar show the invite-code field only when MECENA_SIGNUP_CODE is set.
import { serverEnv } from "@/contracts";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => json({ signupCodeRequired: Boolean(serverEnv().signupCode) }));
