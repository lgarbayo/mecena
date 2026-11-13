import type { ToolContext, ToolName } from "@/contracts";

export interface AgentToolCall {
  name: string;
  input: unknown;
  ok: boolean;
}

/** Matches `AgentResponse` in src/contracts/api.ts. */
export interface AgentTurn {
  reply: string;
  toolCalls: AgentToolCall[];
}

export type AgentHistory = { role: "user" | "assistant"; content: string }[];

/** Tool runner; defaults to the shared registry. Tests inject fakes. */
export type RunToolFn = (name: ToolName, input: unknown, ctx: ToolContext) => Promise<unknown>;
