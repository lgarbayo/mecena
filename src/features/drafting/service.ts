// Owned by WP-08. "Prepárame la solicitud": one draft per profile × call; drafting it uses Pro or one premium credit.
import type { Application, ToolContext, TranscriptSegment } from "@/contracts";
import { getAi } from "@/server/ai";
import { findApplication, getCall, getDossier, getProfile, getTranscript, listWorks, newId, nowIso, saveApplication } from "@/server/store";
import { consumeDraftCredit, requireDraftEntitlement } from "@/features/purchases/server";

/**
 * Returns the existing draft for this call if there is one (no new credit is used, nothing is re-drafted);
 * otherwise checks the entitlement (402 without Pro / Solicitud premium), drafts, saves and consumes a credit.
 */
export async function draftApplication(input: { callId: string; profileId: string }, ctx: Pick<ToolContext, "appUserId"> & Partial<Pick<ToolContext, "caller">>): Promise<Application> {
  const profile = getProfile(input.profileId);
  const call = getCall(input.callId);
  const existing = findApplication(profile.id, call.id);
  if (existing) return existing;

  await requireDraftEntitlement(ctx.appUserId);
  const content = await getAi().draftApplication({
    profile,
    call,
    transcript: getTranscript(profile.id),
    dossier: getDossier(profile.id),
    works: listWorks(profile.id),
  });
  const now = nowIso();
  const app: Application = { id: newId("app"), profileId: profile.id, callId: call.id, version: 1, status: "draft", ...content, createdAt: now, updatedAt: now };
  await saveApplication(app);
  await consumeDraftCredit(ctx.appUserId);
  return app;
}

/** The draft for a call, if any (page load: show it instead of offering to draft again). */
export function findDraft(input: { callId: string; profileId: string }): Application | null {
  const profile = getProfile(input.profileId);
  return findApplication(profile.id, input.callId) ?? null;
}

/** Transcript segments a draft quotes, so the UI can show "Escrito con tus palabras". */
export function draftSources(app: Application): Record<string, TranscriptSegment> {
  const used = new Set(app.sections.flatMap((s) => s.sourceSegmentIds));
  return Object.fromEntries(getTranscript(app.profileId).filter((s) => used.has(s.id)).map((s) => [s.id, s]));
}
