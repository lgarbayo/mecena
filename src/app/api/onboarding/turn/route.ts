// Owned by WP-01. Baseline: one onboarding turn (transcript chunk -> profile patch + dossier sections).
import { OnboardingTurnRequest } from "@/contracts/api";
import { processTurn } from "@/features/onboarding/service";
import { requireUser, resolveProfile } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const input = await body(req, OnboardingTurnRequest);
  const profile = await resolveProfile(user, input.profileId);
  return json(await processTurn({ ...input, profileId: profile.id }));
});
