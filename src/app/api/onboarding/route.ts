// Owned by WP-01. GET current onboarding state (profile, dossier sections, transcript) so /onboarding can resume.
import { getOnboardingState } from "@/features/onboarding/service";
import { warmImportAi } from "@/features/onboarding/import";
import { requireProfile } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const { profile } = await requireProfile(req, new URL(req.url).searchParams.get("profileId"));
  const state = getOnboardingState(profile.id);
  warmImportAi(state.profile.kind);
  return json(state);
});
