// STUB (scaffold, working baseline). Owned by WP-01.
import type { DossierSection, ProfileKind } from "@/contracts";
import type { OnboardingTurnResponse } from "@/contracts/api";
import { getAi } from "@/server/ai";
import { appendSegment, getDossier, getProfile, getTranscript, listWorks, mergeProfile, nowIso, saveDossier, saveProfile } from "@/server/store";

export async function processTurn(input: { profileId?: string; text: string; source: "voice" | "text" }): Promise<OnboardingTurnResponse> {
  const profile = getProfile(input.profileId);
  const segment = await appendSegment(profile.id, input.text, input.source);
  const dossier = getDossier(profile.id);
  const sections: DossierSection[] = dossier?.sections ?? [];
  const result = await getAi().onboardingTurn({
    kind: profile.kind as ProfileKind,
    profile,
    sections,
    transcript: getTranscript(profile.id),
    newSegment: segment,
  });
  const nextProfile = await saveProfile(mergeProfile(profile, result.profilePatch));
  const byKey = new Map(sections.map((s) => [s.key, s]));
  for (const s of result.sectionUpdates) byKey.set(s.key, { ...s, updatedAt: nowIso() });
  const nextSections = [...byKey.values()];
  await saveDossier({
    profileId: profile.id,
    kind: profile.kind,
    sections: nextSections,
    workIds: dossier?.workIds ?? listWorks(profile.id).map((w) => w.id),
    generatedAt: nowIso(),
  });
  return {
    profile: nextProfile,
    sections: nextSections,
    changedSectionKeys: result.sectionUpdates.map((s) => s.key),
    changedProfileFields: Object.keys(result.profilePatch),
    followUpQuestion: result.followUpQuestion,
    segmentId: segment.id,
  };
}
