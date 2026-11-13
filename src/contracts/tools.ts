/**
 * The 8 Mecena tools. ONE definition, two front doors:
 *  - the in-app agent (/api/agent) passes these to Claude as tools,
 *  - the MCP server (src/mcp/server.ts) registers them for Claude Desktop / Claude Code.
 * Handlers live in src/tools/registry.ts and delegate to feature services.
 */
import { z } from "zod";
import { Application, Call, Dossier, JuryScore, MatchResult, Profile, ProfileKind, ProfilePatch } from "./domain";

export const TOOL_NAMES = [
  "get_profile",
  "update_profile",
  "build_dossier",
  "export_dossier_pdf",
  "search_calls",
  "explain_call",
  "draft_application",
  "score_application",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const profileIdIn = z.string().optional().describe("Profile id. Omit to use the active profile.");

export const toolSchemas = {
  get_profile: {
    description: "Get the user's Mecena profile (artist or small business): who they are, disciplines/sector, achievements, funding needs.",
    input: z.object({ profileId: profileIdIn }),
    output: z.object({ profile: Profile }),
  },
  update_profile: {
    description:
      "Update fields of the user's profile. Arrays are merged. Never invent facts the user did not state. Write their words without their typos: fix spelling, accents and dictation slips, keep their wording, names and language (Galician stays Galician).",
    input: z.object({ profileId: profileIdIn, patch: ProfilePatch }),
    output: z.object({ profile: Profile }),
  },
  build_dossier: {
    description:
      "Build the user's dossier (artistic portfolio for creators, capability memoria for businesses). With callId, adapt it to that call's requirements (image limits, ordering).",
    input: z.object({ profileId: profileIdIn, callId: z.string().optional() }),
    output: z.object({ dossier: Dossier, url: z.string() }),
  },
  export_dossier_pdf: {
    description: "Export the dossier as a PDF and return its download URL and local file path.",
    input: z.object({ profileId: profileIdIn, callId: z.string().optional() }),
    output: z.object({ url: z.string(), filePath: z.string(), pages: z.number().int().optional() }),
  },
  search_calls: {
    description:
      "Find open calls (convocatorias, becas, premios, residencias, subvenciones) the user fits, ranked, with why they fit and what they are missing.",
    input: z.object({
      profileId: profileIdIn,
      query: z.string().optional().describe("Free text filter, e.g. 'residencia', 'digitalización'"),
      kind: ProfileKind.optional(),
      limit: z.number().int().min(1).max(25).optional(),
    }),
    output: z.object({ results: z.array(z.object({ call: Call, match: MatchResult })) }),
  },
  explain_call: {
    description: "Explain a call's bases in plain Spanish: who can apply, amount, deadline, documents, scoring criteria, and the user's fit.",
    input: z.object({ callId: z.string(), profileId: profileIdIn }),
    output: z.object({ call: Call, match: MatchResult, checklist: z.array(z.string()) }),
  },
  draft_application: {
    description:
      "Draft the application (memoria, statement or company text, budget, checklist) for a call, written from the user's own words. Requires Pro or a Solicitud premium credit. Mecena prepares; the user submits.",
    input: z.object({ callId: z.string(), profileId: profileIdIn }),
    output: z.object({ application: Application, url: z.string() }),
  },
  score_application: {
    description:
      "Run the simulated jury: several judges score the draft with the call's official criteria and weights and suggest concrete fixes. Orientative only.",
    input: z.object({ applicationId: z.string() }),
    output: z.object({ score: JuryScore, url: z.string() }),
  },
} as const satisfies Record<ToolName, { description: string; input: z.ZodObject; output: z.ZodObject }>;

export type ToolInput<N extends ToolName> = z.infer<(typeof toolSchemas)[N]["input"]>;
export type ToolOutput<N extends ToolName> = z.infer<(typeof toolSchemas)[N]["output"]>;

/** Who is calling a tool. MCP calls have no browser, so entitlement comes from the store. */
export interface ToolContext {
  caller: "app" | "mcp";
  appUserId?: string;
}

export type ToolHandler<N extends ToolName> = (input: ToolInput<N>, ctx: ToolContext) => Promise<ToolOutput<N>>;
export type ToolHandlers = { [N in ToolName]: ToolHandler<N> };

/** Thrown by draft_application when the user has no entitlement. Routes map it to HTTP 402. */
export class PaymentRequiredError extends Error {
  constructor(message = "Necesitas Mecena Pro o una Solicitud premium") {
    super(message);
    this.name = "PaymentRequiredError";
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} no encontrado`);
    this.name = "NotFoundError";
  }
}
