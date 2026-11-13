// Owned by WP-01. GET current onboarding state (profile, dossier sections, transcript) so /onboarding can resume.
import { getOnboardingState } from "@/features/onboarding/service";
import { warmImportAi } from "@/features/onboarding/import";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const profileId = new URL(req.url).searchParams.get("profileId") ?? undefined;
  const state = getOnboardingState(profileId);
  warmImportAi(state.profile.kind);
  return json(state);
});
