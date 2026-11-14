// POST: "Empezar de cero". Wipes the interview, the profile it produced and the dossier text; works stay.
import { OnboardingResetRequest } from "@/contracts/api";
import { restartOnboarding } from "@/features/onboarding/service";
import { requireUser, resolveProfile } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { idempotent } from "@/server/idempotency";

export const dynamic = "force-dynamic";

export const POST = route(
  idempotent(async (req: Request) => {
    const user = requireUser(req);
    const input = await body(req, OnboardingResetRequest);
    const profile = await resolveProfile(user, input.profileId);
    return json(await restartOnboarding(profile.id));
  }),
);
