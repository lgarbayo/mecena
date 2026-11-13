// STUB (scaffold). Owned by WP-04: Claude tool-use loop over src/tools/registry (real) + keyword router (mock).
import { runTool } from "@/tools/registry";

export interface AgentTurn {
  reply: string;
  toolCalls: { name: string; input: unknown; ok: boolean }[];
}

export async function runAgent(message: string, _history: { role: "user" | "assistant"; content: string }[] = []): Promise<AgentTurn> {
  if (/convocatoria|beca|ayuda|premio/i.test(message)) {
    const { results } = await runTool("search_calls", { limit: 3 }, { caller: "app" });
    return {
      reply: results.length ? `He encontrado ${results.length} convocatorias: ${results.map((r) => r.call.title).join("; ")}` : "No he encontrado convocatorias.",
      toolCalls: [{ name: "search_calls", input: { limit: 3 }, ok: true }],
    };
  }
  return { reply: "Puedo buscar convocatorias, preparar tu dossier o tu solicitud.", toolCalls: [] };
}
