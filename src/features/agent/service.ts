/**
 * In-app agent over the shared tools module (WP-04). Same 8 tools as the MCP server.
 * Real mode: Claude tool-use loop (./real.ts). Mock mode (no ANTHROPIC_API_KEY / MECENA_AI_MOCK=1): keyword router (./mock.ts).
 */
import type { ToolContext } from "@/contracts";
import { isMockAi } from "@/server/ai/llm";
import { runTool } from "@/tools/registry";
import { runMockAgent } from "./mock";
import { runRealAgent, type AgentLlmClient } from "./real";
import type { AgentHistory, AgentTurn, RunToolFn } from "./types";

export type { AgentTurn, AgentToolCall, AgentHistory } from "./types";

export interface AgentOptions {
  /** RevenueCat app user id of the caller; omitted = the store's meta.appUserId. */
  appUserId?: string;
  /** Force mock/real mode (defaults to isMockAi()). */
  mock?: boolean;
  run?: RunToolFn;
  client?: AgentLlmClient;
}

export async function runAgent(message: string, history: AgentHistory = [], opts: AgentOptions = {}): Promise<AgentTurn> {
  const run = opts.run ?? runTool;
  const ctx: ToolContext = { caller: "app", ...(opts.appUserId ? { appUserId: opts.appUserId } : {}) };
  if (opts.mock ?? (isMockAi() && !opts.client)) return runMockAgent(message, run, ctx);
  return runRealAgent(message, history, { run, ctx, client: opts.client });
}
