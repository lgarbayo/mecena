// STUB (scaffold, working baseline). Owned by WP-08.
import type { Application, ToolContext } from "@/contracts";
import { getAi } from "@/server/ai";
import { findApplication, getCall, getDossier, getProfile, getTranscript, listWorks, newId, nowIso, saveApplication } from "@/server/store";
import { consumeDraftCredit, requireDraftEntitlement } from "@/features/purchases/server";

export async function draftApplication(input: { callId: string; profileId?: string }, ctx: ToolContext): Promise<Application> {
  await requireDraftEntitlement(ctx.appUserId);
  const profile = getProfile(input.profileId);
  const call = getCall(input.callId);
  const content = await getAi().draftApplication({
    profile,
    call,
    transcript: getTranscript(profile.id),
    dossier: getDossier(profile.id),
    works: listWorks(profile.id),
  });
  const existing = findApplication(profile.id, call.id);
  const app: Application = {
    id: existing?.id ?? newId("app"),
    profileId: profile.id,
    callId: call.id,
    version: (existing?.version ?? 0) + 1,
    status: "draft",
    ...content,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  await saveApplication(app);
  if (!existing) await consumeDraftCredit(ctx.appUserId);
  return app;
}
