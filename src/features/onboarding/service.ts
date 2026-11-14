/**
 * Onboarding turn (WP-01): one transcript chunk -> stored segment -> AI extraction -> merged profile +
 * replace-by-key dossier sections. The transcript is persisted BEFORE the AI runs, so a failure never
 * loses what the user said; a client retry of the same chunk reuses that segment instead of duplicating it.
 */
import { OnboardingTurnResult, type DossierSection, type OnboardingTurnInput, type Profile, type TranscriptSegment } from "@/contracts";
import type { OnboardingTurnResponse } from "@/contracts/api";
import { getAi, mockAi } from "@/server/ai";
import { appendSegment, getDossier, getProfile, getTranscript, listWorks, mergeProfile, nowIso, saveDossier, saveProfile } from "@/server/store";
import { warmOnboardingAi } from "./ai";
import { sectionTitles } from "./copy";

/** A retry of the same chunk within this window reuses the last segment. */
const RETRY_WINDOW_MS = 5 * 60_000;

async function segmentFor(profileId: string, text: string, source: "voice" | "text"): Promise<TranscriptSegment> {
  const last = getTranscript(profileId).at(-1);
  if (last && last.text === text && last.source === source && Date.now() - Date.parse(last.at) < RETRY_WINDOW_MS) return last;
  return appendSegment(profileId, text, source);
}

async function runAi(input: OnboardingTurnInput): Promise<OnboardingTurnResult> {
  try {
    return OnboardingTurnResult.parse(await getAi().onboardingTurn(input));
  } catch (e) {
    console.warn("[onboarding] AI turn failed, using the deterministic extractor:", e instanceof Error ? e.message : e);
    return mockAi().onboardingTurn(input);
  }
}

const comparable = (v: unknown) => JSON.stringify(v ?? null);

export function changedFields(before: Profile, after: Profile): string[] {
  return (Object.keys(after) as (keyof Profile)[]).filter((k) => k !== "updatedAt" && comparable(before[k]) !== comparable(after[k]));
}

export async function processTurn(input: { profileId?: string; text: string; source: "voice" | "text" }): Promise<OnboardingTurnResponse> {
  const profile = getProfile(input.profileId);
  const segment = await segmentFor(profile.id, input.text.trim(), input.source);
  const dossier = getDossier(profile.id);
  const sections: DossierSection[] = dossier?.sections ?? [];
  const result = await runAi({
    kind: profile.kind,
    profile,
    sections,
    transcript: getTranscript(profile.id),
    newSegment: segment,
  });

  // Apply the result to the state as it is NOW, not to the snapshot the AI saw: a slow run the client already gave up
  // on (and retried) can finish after later turns, and must not overwrite what they saved. A section that changed
  // meanwhile keeps the newer text.
  const current = getProfile(profile.id);
  const latest = getDossier(profile.id);
  const nextProfile = await saveProfile(mergeProfile(current, result.profilePatch));

  const allowed = sectionTitles(profile.kind);
  const updates = result.sectionUpdates.filter((s) => s.key in allowed);
  const seen = new Map(sections.map((s) => [s.key, s.body]));
  const byKey = new Map((latest?.sections ?? []).map((s) => [s.key, s]));
  const changedSectionKeys: string[] = [];
  for (const s of updates) {
    const prev = byKey.get(s.key);
    if (prev && prev.body !== seen.get(s.key)) continue;
    if (prev && prev.body === s.body) continue;
    byKey.set(s.key, { ...s, updatedAt: nowIso() });
    changedSectionKeys.push(s.key);
  }
  // Keep the dossier in the canonical section order for the profile kind.
  const order = Object.keys(allowed);
  const nextSections = [...byKey.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  await saveDossier({
    profileId: profile.id,
    kind: profile.kind,
    sections: nextSections,
    workIds: latest?.workIds ?? listWorks(profile.id).map((w) => w.id),
    variant: latest?.variant,
    generatedAt: nowIso(),
  });
  return {
    profile: nextProfile,
    sections: nextSections,
    changedSectionKeys,
    changedProfileFields: changedFields(current, nextProfile),
    followUpQuestion: result.followUpQuestion,
    segmentId: segment.id,
  };
}

/** Current onboarding state for the active (or given) profile: lets /onboarding resume after a reload. */
export function getOnboardingState(profileId?: string) {
  const profile = getProfile(profileId);
  warmOnboardingAi(profile.kind);
  return { profile, sections: getDossier(profile.id)?.sections ?? [], transcript: getTranscript(profile.id) };
}
