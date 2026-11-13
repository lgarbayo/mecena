/**
 * Shared tools module (scaffold-owned): the single implementation behind both the in-app agent and the MCP server.
 * Handlers are thin: validate input with the contract schema, delegate to feature services.
 */
import { serverEnv, toolSchemas, TOOL_NAMES, type ToolContext, type ToolHandlers, type ToolInput, type ToolName, type ToolOutput } from "@/contracts";
import { getProfile, patchProfile } from "@/server/store";
import { buildDossier, dossierUrl, exportDossierPdf } from "@/features/dossier/service";
import { explainCall, searchCalls } from "@/features/matching/service";
import { draftApplication } from "@/features/drafting/service";
import { scoreApplication } from "@/features/jury/service";

const base = () => serverEnv().publicUrl;

export const handlers: ToolHandlers = {
  get_profile: async ({ profileId }) => ({ profile: getProfile(profileId) }),
  update_profile: async ({ profileId, patch }) => ({ profile: await patchProfile(profileId, patch) }),
  build_dossier: async (input) => {
    const dossier = await buildDossier(input);
    return { dossier, url: dossierUrl(dossier.profileId, input.callId) };
  },
  export_dossier_pdf: async (input) => exportDossierPdf(input),
  search_calls: async (input) => ({ results: await searchCalls(input) }),
  explain_call: async (input) => explainCall(input),
  draft_application: async (input, ctx) => {
    const application = await draftApplication(input, ctx);
    return { application, url: `${base()}/solicitud/${encodeURIComponent(application.callId)}` };
  },
  score_application: async ({ applicationId }) => {
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
