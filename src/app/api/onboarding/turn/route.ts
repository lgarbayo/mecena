// Owned by WP-01. Baseline: one onboarding turn (transcript chunk -> profile patch + dossier sections).
import { OnboardingTurnRequest } from "@/contracts/api";
import { processTurn } from "@/features/onboarding/service";
import { scheduleProfileSearch } from "@/features/calls-ingest/live";
import { requireUser, resolveProfile } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { limitAi } from "@/server/ai-limits";
import { idempotent } from "@/server/idempotency";

export const dynamic = "force-dynamic";

// Idempotent: a turn retried after a lost response (same Idempotency-Key) replays the first answer instead of
// appending the same words to the transcript twice.
export const POST = route(
  idempotent(async (req: Request) => {
    const user = requireUser(req);
    limitAi(user, "onboarding-turn");
    const input = await body(req, OnboardingTurnRequest);
    const profile = await resolveProfile(user, input.profileId);
    const result = await processTurn({ ...input, profileId: profile.id });
    // The profile may have changed: search BDNS for it in the background (debounced; onboarding saves every turn).
    scheduleProfileSearch({ profileId: profile.id, appUserId: user.appUserId });
    return json(result);
  }),
);
