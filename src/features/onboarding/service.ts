/**
 * Onboarding turn (WP-01): one transcript chunk -> stored segment -> AI extraction -> merged profile +
 * replace-by-key dossier sections. The transcript is persisted BEFORE the AI runs, so a failure never
 * loses what the user said; a client retry of the same chunk reuses that segment instead of duplicating it.
 */
import { OnboardingTurnResult, type DossierSection, type OnboardingTurnInput, type Profile, type TranscriptSegment } from "@/contracts";
import type { OnboardingTurnResponse } from "@/contracts/api";
import { getAi, mockAi } from "@/server/ai";
import { appendSegment, getDossier, getProfile, getTranscript, listWorks, mergeProfile, nowIso, saveDossier, saveProfile, updateDb } from "@/server/store";
import { forgetDesigns, requestDesign } from "@/features/dossier/designs";
import { warmOnboardingAi } from "./ai";
import { sectionTitles } from "./copy";
import { ensureLayoutEntry, saveLayoutWish } from "@/features/dossier/layout/service";
import { dossierLookRequests } from "./interview";
import { DOSSIER_LOOK_STEP } from "./steps";

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

/** A fresh onboarding: the profile keeps its id, owner and kind; what the user said before (and what was read from it) goes. */
async function resetProfile(profile: Profile): Promise<Profile> {
  await updateDb((db) => {
    db.transcripts = db.transcripts.filter((t) => t.profileId !== profile.id);
    const d = db.dossiers.find((x) => x.profileId === profile.id);
    if (d) d.sections = [];
  });
  forgetDesigns([profile.id]); // the look came from the old interview too
  return saveProfile({
    id: profile.id,
    ownerId: profile.ownerId,
    kind: profile.kind,
    beneficiaryTypes: [],
    displayName: "",
    disciplines: [],
    bio: "",
    statement: "",
    achievements: [],
    education: [],
    links: [],
    fundingNeeds: [],
    languages: profile.languages,
    updatedAt: nowIso(),
  });
}

export async function processTurn(input: { profileId: string; text: string; source: "voice" | "text"; stepKey?: string; reset?: boolean }): Promise<OnboardingTurnResponse> {
  let profile = getProfile(input.profileId);
  if (input.reset) profile = await resetProfile(profile);
  // A new artist's first design is the free layout: its entry exists before any template design is saved.
  ensureLayoutEntry(profile.id);
  // If a business profile is still holding the untouched fixtureBusiness seed ("Cerámica Mareira") with zero transcript
  // segments, clear the pre-seeded fields before the user's first onboarding turn so their company starts fresh.
  if (
    profile.kind === "business" &&
    profile.displayName === "Cerámica Mareira" &&
    profile.cnae === "2341" &&
    getTranscript(profile.id).length === 0
  ) {
    profile = await saveProfile({
      id: profile.id,
      ownerId: profile.ownerId,
      kind: "business",
      beneficiaryTypes: [],
      displayName: "",
      disciplines: [],
      bio: "",
      statement: "",
      achievements: [],
      education: [],
      links: [],
      fundingNeeds: [],
      languages: [],
      updatedAt: nowIso(),
    });
  }
  const segment = await segmentFor(profile.id, input.text.trim(), input.source);
  // The answer to "¿cómo te imaginas tu dossier?" is a brief for the designers, not about the artist: it never reaches
  // the profile or the dossier text (nor a follow-up question that would replace the step).
  if (input.stepKey === DOSSIER_LOOK_STEP) return lookTurn(profile, segment, input.text);
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
  let nextProfile = await saveProfile(mergeProfile(current, result.profilePatch));

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
  // The matching engine reads the profile, not the dossier: give it the narrative the user just told us.
  const body = (key: string) => nextSections.find((x) => x.key === key)?.body.trim() ?? "";
  const bio = body(profile.kind === "business" ? "activity" : "bio");
  const statement = body(profile.kind === "business" ? "projects" : "statement") || body("series");
  if ((!nextProfile.bio && bio) || (!nextProfile.statement && statement)) {
    nextProfile = await saveProfile({ ...nextProfile, bio: nextProfile.bio || bio, statement: nextProfile.statement || statement, updatedAt: nowIso() });
  }
  await saveDossier({
    profileId: profile.id,
    kind: profile.kind,
    sections: nextSections,
    workIds: latest?.workIds ?? listWorks(profile.id).map((w) => w.id),
    variant: latest?.variant,
    generatedAt: nowIso(),
  });
  redesignFromInterview(profile.id, segment);
  return {
    profile: nextProfile,
    sections: nextSections,
    changedSectionKeys,
    changedProfileFields: changedFields(current, nextProfile),
    followUpQuestion: result.followUpQuestion,
    segmentId: segment.id,
  };
}

function lookTurn(profile: Profile, segment: TranscriptSegment, text: string): OnboardingTurnResponse {
  saveLayoutWish({ profileId: profile.id, text, segmentId: segment.id });
  // a typed answer is always a direction ("Oscuro."); a voice fragment ("pues…") only once it says something
  if (segment.source === "text" || text.trim().split(/\s+/).length >= 3) redesignFromInterview(profile.id, segment, true);
  return { profile, sections: getDossier(profile.id)?.sections ?? [], changedSectionKeys: [], changedProfileFields: [], segmentId: segment.id };
}

/** Design requests started by the interview and not finished yet (tests await them). */
export const pendingDesigns = new Set<Promise<unknown>>();

/**
 * When the artist says how their dossier should look ("fondo negro, sobrio"), that goes to the design agent
 * right away, on top of the current design, instead of staying a line in the transcript. In the background:
 * the interview never waits for the designer.
 */
function redesignFromInterview(profileId: string, segment: TranscriptSegment, lookStep = false) {
  const asked = lookStep || dossierLookRequests(getTranscript(profileId)).some((s) => s.id === segment.id);
  if (!asked) return;
  const job = requestDesign({ profileId, request: segment.text, segmentId: segment.id })
    .catch((e: unknown) => console.error("[onboarding] could not apply the dossier look the artist asked for", e))
    .finally(() => pendingDesigns.delete(job));
  pendingDesigns.add(job);
}

/** Current onboarding state for this profile: lets /onboarding resume after a reload. */
export function getOnboardingState(profileId: string) {
  const profile = getProfile(profileId);
  warmOnboardingAi(profile.kind);
  return { profile, sections: getDossier(profile.id)?.sections ?? [], transcript: getTranscript(profile.id) };
}
