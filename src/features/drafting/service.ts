// Owned by WP-08. "Prepárame la solicitud": one draft per profile × call; drafting it uses Pro or one premium credit.
import type { Application, ToolContext, TranscriptSegment } from "@/contracts";
import { getAi } from "@/server/ai";
import { findApplication, getCall, getDossier, getProfile, getTranscript, listWorks, newId, nowIso, saveApplication } from "@/server/store";
import { reserveDraftCredit } from "@/features/purchases/server";

/** Drafts in progress per `${profileId}|${callId}`: a double tap waits for the same draft instead of paying twice. */
const inflight = new Map<string, Promise<Application>>();

/**
 * Returns the existing draft for this call if there is one (no new credit is used, nothing is re-drafted);
 * otherwise reserves the entitlement BEFORE the AI (402 without Pro / Solicitud premium; the credit is taken
 * atomically), drafts and saves, and gives the credit back if drafting fails.
 */
export async function draftApplication(input: { callId: string; profileId: string }, ctx: Pick<ToolContext, "appUserId"> & Partial<Pick<ToolContext, "caller">>): Promise<Application> {
  const profile = getProfile(input.profileId);
  const call = getCall(input.callId);
  const existing = findApplication(profile.id, call.id);
  if (existing) return existing;
  const key = `${profile.id}|${call.id}`;
  const running = inflight.get(key);
  if (running) return running;

  const job = (async (): Promise<Application> => {
    const credit = await reserveDraftCredit(ctx.appUserId);
    try {
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
      return app;
    } catch (e) {
      await credit.refund();
      throw e;
    }
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
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
