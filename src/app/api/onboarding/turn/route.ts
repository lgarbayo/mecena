// Owned by WP-01. Baseline: one onboarding turn (transcript chunk -> profile patch + dossier sections).
import { OnboardingTurnRequest } from "@/contracts/api";
import { processTurn } from "@/features/onboarding/service";
import { scheduleProfileSearch } from "@/features/calls-ingest/live";
import { requireUser, resolveProfile } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const input = await body(req, OnboardingTurnRequest);
  const profile = await resolveProfile(user, input.profileId);
  const result = await processTurn({ ...input, profileId: profile.id });
  // The profile may have changed: search BDNS for it in the background (debounced; onboarding saves every turn).
  scheduleProfileSearch({ profileId: profile.id, appUserId: user.appUserId });
  return json(result);
});
