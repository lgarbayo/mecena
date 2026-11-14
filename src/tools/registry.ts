/**
 * Shared tools module (scaffold-owned): the single implementation behind both the in-app agent and the MCP server
 * (remote /api/mcp and local stdio).
 * Handlers are thin: validate input with the contract schema, scope it to the caller (ToolContext), delegate to
 * feature services. The model never chooses whose data it touches: a profileId it passes must belong to
 * ctx.userId (else "not found"), an omitted one is the user's active profile, and entitlements use ctx.appUserId.
 * Paywalls are the app's: the free plan sees its top matches only (./limits) and the dossier call variant is Pro.
 */
import { z } from "zod";
import { serverEnv, toolSchemas, TOOL_NAMES, type ToolContext, type ToolHandlers, type ToolInput, type ToolName, type ToolOutput } from "@/contracts";
import { getCall, patchProfile } from "@/server/store";
import { scheduleProfileSearch } from "@/features/calls-ingest/live";
import { ownedApplication, ownedProfile } from "@/server/auth";
import { buildDossier, dossierUrl, exportDossierPdf, loadDossierData } from "@/features/dossier/service";
import { explainCall, searchCalls } from "@/features/matching/service";
import { draftApplication } from "@/features/drafting/service";
import { scoreApplication } from "@/features/jury/service";
import { withJuryRun } from "@/features/purchases/server";
import { canAdaptDossier, limitMatches, requireCallVisible } from "./limits";

const base = () => serverEnv().publicUrl;

/** Default number of calls search_calls lists (the model can ask for up to 25). */
export const DEFAULT_SEARCH_LIMIT = 10;

/** The profile a tool call is about: the caller's own (given) profile, or their active one. */
const profileFor = (input: { profileId?: string }, ctx: ToolContext): string => ownedProfile(ctx.userId, input.profileId ?? ctx.profileId).id;

/** Open and upcoming calls are the ones you can still apply to; recurring/closed ones only on request. */
const applicable = (status: string) => status === "open" || status === "upcoming";

export const handlers: ToolHandlers = {
  get_profile: async (input, ctx) => ({ profile: ownedProfile(ctx.userId, profileFor(input, ctx)) }),
  update_profile: async (input, ctx) => {
    const profile = await patchProfile(profileFor(input, ctx), input.patch);
    scheduleProfileSearch({ profileId: profile.id, appUserId: ctx.appUserId }); // background BDNS search (off in the MCP process)
    return { profile };
  },
  build_dossier: async (input, ctx) => {
    const profileId = profileFor(input, ctx);
    if (!input.callId) return { dossier: await buildDossier({ profileId }), url: dossierUrl(profileId), adapted: false };
    getCall(input.callId); // unknown call: "not found" before anything else
    // The call variant is Pro (same rule as /api/dossier): without it, the general dossier plus the call's notes as a
    // preview, built without any model call. That is exactly what the returned link shows to a free user.
    const adapted = await canAdaptDossier(ctx);
    const dossier = adapted ? await buildDossier({ profileId, callId: input.callId }) : (await loadDossierData({ profileId, callId: input.callId, adapt: false })).dossier;
    return { dossier, url: dossierUrl(profileId, input.callId), adapted };
  },
  export_dossier_pdf: async (input, ctx) => {
    const profileId = profileFor(input, ctx);
    if (input.callId) getCall(input.callId);
    const adapted = Boolean(input.callId) && (await canAdaptDossier(ctx));
    // The URL is the authenticated download route (same Pro rule); the server-side file path never leaves the server.
    const { url, pages } = await exportDossierPdf({ profileId, callId: adapted ? input.callId : undefined });
    return { url, ...(pages ? { pages } : {}), adapted, ...(input.callId ? { callId: input.callId } : {}) };
  },
  search_calls: async (input, ctx) => {
    const profileId = profileFor(input, ctx);
    const ranked = await searchCalls({ profileId, query: input.query, kind: input.kind, limit: 1000 });
    const current = input.includeClosed ? ranked : ranked.filter((r) => applicable(r.call.status));
    const { pro, visible, lockedCount } = await limitMatches(ctx, profileId, current);
    return {
      results: visible.slice(0, input.limit ?? DEFAULT_SEARCH_LIMIT).map(({ call, match }) => ({ call, match })),
      lockedCount,
      pro,
      closedCount: ranked.length - current.length,
    };
  },
  explain_call: async (input, ctx) => {
    const profileId = profileFor(input, ctx);
    getCall(input.callId);
    await requireCallVisible(ctx, profileId, input.callId);
    return explainCall({ ...input, profileId });
  },
  draft_application: async (input, ctx) => {
    const application = await draftApplication({ ...input, profileId: profileFor(input, ctx) }, ctx);
    return { application, url: `${base()}/solicitud/${encodeURIComponent(application.callId)}` };
  },
  score_application: async ({ applicationId }, ctx) => {
    ownedApplication(ctx.userId, applicationId);
    const score = await withJuryRun(ctx.appUserId, applicationId, () => scoreApplication(applicationId));
    return { score, url: `${base()}/tribunal/${encodeURIComponent(applicationId)}` };
  },
};

/** Validation messages in Spanish (they reach the user through Claude). */
const spanishErrors = z.locales.es().localeError;

/** Validate + run a tool by name. Throws zod errors (Spanish messages) on bad input. */
export async function runTool<N extends ToolName>(name: N, rawInput: unknown, ctx: ToolContext): Promise<ToolOutput<N>> {
  const input = toolSchemas[name].input.parse(rawInput ?? {}, { error: spanishErrors }) as ToolInput<N>;
  return (handlers[name] as (i: ToolInput<N>, c: ToolContext) => Promise<ToolOutput<N>>)(input, ctx);
}

export function isToolName(n: string): n is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(n);
}
