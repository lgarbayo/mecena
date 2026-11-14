/**
 * Shared tools module (scaffold-owned): the single implementation behind both the in-app agent and the MCP server.
 * Handlers are thin: validate input with the contract schema, scope it to the caller (ToolContext), delegate to
 * feature services. The model never chooses whose data it touches: a profileId it passes must belong to
 * ctx.userId (else "not found"), an omitted one is the user's active profile, and entitlements use ctx.appUserId.
 */
import { serverEnv, toolSchemas, TOOL_NAMES, type ToolContext, type ToolHandlers, type ToolInput, type ToolName, type ToolOutput } from "@/contracts";
import { patchProfile } from "@/server/store";
import { ownedApplication, ownedProfile } from "@/server/auth";
import { buildDossier, dossierUrl, exportDossierPdf } from "@/features/dossier/service";
import { explainCall, searchCalls } from "@/features/matching/service";
import { draftApplication } from "@/features/drafting/service";
import { scoreApplication } from "@/features/jury/service";

const base = () => serverEnv().publicUrl;

/** The profile a tool call is about: the caller's own (given) profile, or their active one. */
const profileFor = (input: { profileId?: string }, ctx: ToolContext): string => ownedProfile(ctx.userId, input.profileId ?? ctx.profileId).id;

export const handlers: ToolHandlers = {
  get_profile: async (input, ctx) => ({ profile: ownedProfile(ctx.userId, profileFor(input, ctx)) }),
  update_profile: async (input, ctx) => ({ profile: await patchProfile(profileFor(input, ctx), input.patch) }),
  build_dossier: async (input, ctx) => {
    const dossier = await buildDossier({ ...input, profileId: profileFor(input, ctx) });
    return { dossier, url: dossierUrl(dossier.profileId, input.callId) };
  },
  export_dossier_pdf: async (input, ctx) => exportDossierPdf({ ...input, profileId: profileFor(input, ctx) }),
  search_calls: async (input, ctx) => ({ results: await searchCalls({ ...input, profileId: profileFor(input, ctx) }) }),
  explain_call: async (input, ctx) => explainCall({ ...input, profileId: profileFor(input, ctx) }),
  draft_application: async (input, ctx) => {
    const application = await draftApplication({ ...input, profileId: profileFor(input, ctx) }, ctx);
    return { application, url: `${base()}/solicitud/${encodeURIComponent(application.callId)}` };
  },
  score_application: async ({ applicationId }, ctx) => {
    ownedApplication(ctx.userId, applicationId);
    const score = await scoreApplication(applicationId);
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
