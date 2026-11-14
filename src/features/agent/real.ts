/**
 * Real-mode agent: Claude (smart tier) with the 8 shared tools, manual tool-use loop.
 * tool_choice is always "auto": claude-opus-5-5 / claude-sonnet-5-5 reject forced tool_choice.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { TOOL_NAMES, toolSchemas, type ToolContext } from "@/contracts";
import { AiError, anthropic, chargeAiCall, modelFor } from "@/server/ai/llm";
import { isToolName } from "@/tools/registry";
import { summarizeToolResult, toolErrorMessage, toolInputJsonSchema } from "@/tools/present";
import type { AgentHistory, AgentToolCall, AgentTurn, RunToolFn } from "./types";

export const MAX_AGENT_ITERATIONS = 6;
const MAX_TOOL_JSON_CHARS = 20_000;

export const AGENT_SYSTEM_PROMPT = `Eres Mecena, el asistente de papeleo de artistas, ilustradores, fotógrafos, pymes y autónomos en España.
Lema: «Mecena prepara; tú presentas». Preparas dossieres, buscas convocatorias (becas, premios, residencias, subvenciones), explicas bases, redactas solicitudes con las propias palabras de la persona y las pasas por un tribunal simulado. Nunca presentas nada en su nombre.

Reglas:
- Responde siempre en español de España, tuteando (nunca voseo), en un tono cercano y concreto. Respuestas breves: 2-5 frases o una lista corta.
- Usa las herramientas para cualquier dato del perfil, las convocatorias, el dossier, la solicitud o la puntuación. No inventes convocatorias, cuantías, plazos ni méritos.
- Si la persona menciona una convocatoria por su nombre y no tienes su id, llama primero a search_calls con una consulta y usa el id que devuelva.
- Para «hazme el dossier para la convocatoria X»: build_dossier con su callId y, si pide el archivo, export_dossier_pdf.
- Para puntuar una solicitud necesitas su applicationId (lo devuelve draft_application).
- Si una herramienta devuelve error de pago, explica con amabilidad que hace falta Mecena Pro o una Solicitud premium y comparte el enlace.
- Incluye siempre los enlaces (url) que devuelven las herramientas para que la persona los abra en el móvil.
- La puntuación del tribunal es orientativa: no la presentes como una predicción de la resolución real.`;

/** The subset of the Anthropic client the loop uses (tests inject a fake). */
export interface AgentLlmClient {
  messages: { create(params: Anthropic.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Messages.Message> };
}

export function agentTools(): Anthropic.Messages.Tool[] {
  return TOOL_NAMES.map((name) => ({ name, description: toolSchemas[name].description, input_schema: toolInputJsonSchema(name) }));
}

/** Anthropic needs a user-first, alternating conversation: drop leading assistant turns, merge repeats. */
export function historyToMessages(history: AgentHistory, message: string): Anthropic.Messages.MessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of [...history, { role: "user" as const, content: message }]) {
    const content = h.content.trim();
    if (!content || (!out.length && h.role === "assistant")) continue;
    const last = out[out.length - 1];
    if (last?.role === h.role) last.content += `\n\n${content}`;
    else out.push({ role: h.role, content });
  }
  return out;
}

const textOf = (content: Anthropic.Messages.ContentBlock[]) =>
  content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

function toolResultText(name: Parameters<typeof summarizeToolResult>[0], out: unknown): string {
  let raw = JSON.stringify(out);
  if (raw.length > MAX_TOOL_JSON_CHARS) raw = `${raw.slice(0, MAX_TOOL_JSON_CHARS)}… (recortado)`;
  return `${summarizeToolResult(name, out as never)}\n\nJSON:\n${raw}`;
}

export interface RealAgentDeps {
  run: RunToolFn;
  ctx: ToolContext;
  client?: AgentLlmClient;
}

export async function runRealAgent(message: string, history: AgentHistory, deps: RealAgentDeps): Promise<AgentTurn> {
  const client = deps.client ?? anthropic();
  const messages = historyToMessages(history, message);
  const tools = agentTools();
  const toolCalls: AgentToolCall[] = [];
  const summaries: string[] = [];

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    chargeAiCall(); // global daily ceiling of Claude requests (src/server/ai/budget.ts)
    const res = await client.messages
      .create({
        model: modelFor("smart"),
        max_tokens: 4096,
        system: AGENT_SYSTEM_PROMPT,
        messages,
        tools,
        tool_choice: { type: "auto" },
        output_config: { effort: "medium" },
      })
      .catch((e: unknown) => {
        throw new AiError(e instanceof Error ? e.message : String(e), "api");
      });

    if (res.stop_reason === "refusal") return { reply: "Lo siento, no puedo ayudarte con eso. Puedo buscar convocatorias, preparar tu dossier o tu solicitud.", toolCalls };

    const uses = res.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      return { reply: textOf(res.content) || summaries.join("\n\n") || "Hecho.", toolCalls };
    }

    messages.push({ role: "assistant", content: res.content as Anthropic.Messages.ContentBlockParam[] });
    const results: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const use of uses) {
      if (!isToolName(use.name)) {
        toolCalls.push({ name: use.name, input: use.input, ok: false });
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: `Herramienta desconocida: ${use.name}` });
        continue;
      }
      try {
        const out = await deps.run(use.name, use.input, deps.ctx);
        toolCalls.push({ name: use.name, input: use.input, ok: true });
        summaries.push(summarizeToolResult(use.name, out as never));
        results.push({ type: "tool_result", tool_use_id: use.id, content: toolResultText(use.name, out) });
      } catch (e) {
        toolCalls.push({ name: use.name, input: use.input, ok: false });
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: toolErrorMessage(e) });
      }
    }
    messages.push({ role: "user", content: results });
  }

  // Out of iterations: report what was done rather than failing the turn.
  const done = summaries.length ? summaries.join("\n\n") : "No he podido terminar la tarea.";
  return { reply: `${done}\n\nHe llegado al límite de pasos por mensaje; dime cómo quieres seguir.`, toolCalls };
}
