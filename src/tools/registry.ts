/**
 * Shared tools module (scaffold-owned): the single implementation behind both the in-app agent and the MCP server.
 * Handlers are thin: validate input with the contract schema, scope it to the caller (ToolContext), delegate to
 * feature services. The model never chooses whose data it touches: a profileId it passes must belong to
 * ctx.userId (else "not found"), an omitted one is the user's active profile, and entitlements use ctx.appUserId.
 */
import { serverEnv, toolSchemas, TOOL_NAMES, type ToolContext, type ToolHandlers, type ToolInput, type ToolName, type ToolOutput } from "@/contracts";
import { getCall, getProfile, patchProfile } from "@/server/store";
import { scheduleProfileSearch } from "@/features/calls-ingest/live";
import { ownedApplication, ownedProfile } from "@/server/auth";
import { buildDossier, dossierUrl, exportDossierPdf } from "@/features/dossier/service";
import { explainCall, ruleMatch, searchCallsForUser } from "@/features/matching/service";
import { canSeeCall, lockedMatch } from "@/features/matching/usage";
import { draftApplication } from "@/features/drafting/service";
import { scoreApplication } from "@/features/jury/service";
import { withJuryRun } from "@/features/purchases/server";

const base = () => serverEnv().publicUrl;

/** The profile a tool call is about: the caller's own (given) profile, or their active one. */
const profileFor = (input: { profileId?: string }, ctx: ToolContext): string => ownedProfile(ctx.userId, input.profileId ?? ctx.profileId).id;

export const handlers: ToolHandlers = {
  get_profile: async (input, ctx) => ({ profile: ownedProfile(ctx.userId, profileFor(input, ctx)) }),
  update_profile: async (input, ctx) => {
    const profile = await patchProfile(profileFor(input, ctx), input.patch);
    scheduleProfileSearch({ profileId: profile.id, appUserId: ctx.appUserId }); // background BDNS search (off in the MCP process)
    return { profile };
  },
  build_dossier: async (input, ctx) => {
    const dossier = await buildDossier({ ...input, profileId: profileFor(input, ctx) });
    return { dossier, url: dossierUrl(dossier.profileId, input.callId) };
  },
  export_dossier_pdf: async (input, ctx) => exportDossierPdf({ ...input, profileId: profileFor(input, ctx) }),
  search_calls: async (input, ctx) => ({ results: await searchCallsForUser({ ...input, profileId: profileFor(input, ctx), appUserId: ctx.appUserId }) }),
  explain_call: async (input, ctx) => {
    const profileId = profileFor(input, ctx);
    // Free plan: only calls unlocked this month (or a closed edition) get the full explanation.
    const call = getCall(input.callId);
    if (call.status !== "recurring" && !(await canSeeCall({ appUserId: ctx.appUserId, profileId, callId: call.id }))) {
      const full = ruleMatch(getProfile(profileId), call);
      return { call, match: lockedMatch(full), checklist: [] };
    }
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

/** Validate + run a tool by name. Throws zod errors on bad input. */
export async function runTool<N extends ToolName>(name: N, rawInput: unknown, ctx: ToolContext): Promise<ToolOutput<N>> {
  const input = toolSchemas[name].input.parse(rawInput ?? {}) as ToolInput<N>;
  return (handlers[name] as (i: ToolInput<N>, c: ToolContext) => Promise<ToolOutput<N>>)(input, ctx);
}

export function isToolName(n: string): n is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(n);
}
