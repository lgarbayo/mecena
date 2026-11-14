/**
 * Real-mode agent: Claude with the 8 shared tools, manual tool-use loop.
 * tool_choice is always "auto": claude-opus-5-5 / claude-sonnet-5-5 reject forced tool_choice.
 *
 * Cost guards (the owner's key pays every request; rate limits and body sizes live in the route): the fast tier
 * (picking tools and writing 2-5 sentences needs no Opus; the heavy work happens inside the tools with their own
 * tiers), a few iterations, a small max_tokens per step, a token budget per user message, a trimmed history and
 * trimmed tool JSON.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { TOOL_NAMES, toolSchemas, type ToolContext } from "@/contracts";
import { AiError, anthropic, chargeAiCall, modelFor } from "@/server/ai/llm";
import { isToolName } from "@/tools/registry";
import { isExpectedToolError, summarizeToolResult, toolErrorMessage, toolInputJsonSchema } from "@/tools/present";
import type { AgentHistory, AgentToolCall, AgentTurn, RunToolFn } from "./types";

export const MAX_AGENT_ITERATIONS = 4;
/** Output tokens per model step: replies are 2-5 sentences plus tool calls. */
export const AGENT_MAX_OUTPUT_TOKENS = 1024;
/** Input + output tokens one user message may spend across all its steps; past it the loop stops and reports. */
export const AGENT_TOKEN_BUDGET = 60_000;
/** History sent to Claude: the last messages only, each trimmed. */
export const AGENT_MAX_HISTORY = 12;
export const AGENT_MAX_MESSAGE_CHARS = 2_000;
const MAX_TOOL_JSON_CHARS = 6_000;

export const AGENT_SYSTEM_PROMPT = `Eres Mecena, el asistente de papeleo de artistas, ilustradores, fotógrafos, pymes y autónomos en España.
Lema: «Mecena prepara; tú presentas». Preparas dossieres, buscas convocatorias (becas, premios, residencias, subvenciones), explicas bases, redactas solicitudes con las propias palabras de la persona y las pasas por un tribunal simulado. Nunca presentas nada en su nombre.

Reglas:
- Responde siempre en español de España y tutea (tú, nunca usted ni voseo: «tienes», «puedes», «dime»), en un tono cercano y concreto. Respuestas breves: 2-5 frases o una lista corta.
- Usa las herramientas para cualquier dato del perfil, las convocatorias, el dossier, la solicitud o la puntuación. No inventes convocatorias, cuantías, plazos ni méritos.
- Si la persona menciona una convocatoria por su nombre y no tienes su id, llama primero a search_calls con una consulta y usa el id que devuelva.
- Para «hazme el dossier para la convocatoria X»: build_dossier con su callId y, si pide el archivo, export_dossier_pdf.
- Para puntuar una solicitud necesitas su applicationId (lo devuelve draft_application).
- Si una herramienta devuelve error de pago, o te dice que hay más resultados o una adaptación con Mecena Pro, explícalo con amabilidad y comparte el enlace; no intentes rodearlo con otras herramientas.
- Incluye siempre los enlaces (url) que devuelven las herramientas para que la persona los abra en el móvil.
- La puntuación del tribunal es orientativa: no la presentes como una predicción de la resolución real.`;

/** The subset of the Anthropic client the loop uses (tests inject a fake). */
export interface AgentLlmClient {
  messages: { create(params: Anthropic.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Messages.Message> };
}

export function agentTools(): Anthropic.Messages.Tool[] {
  return TOOL_NAMES.map((name) => ({ name, description: toolSchemas[name].description, input_schema: toolInputJsonSchema(name) }));
}

const clip = (s: string) => (s.length > AGENT_MAX_MESSAGE_CHARS ? `${s.slice(0, AGENT_MAX_MESSAGE_CHARS)}… (recortado)` : s);

/**
 * Anthropic needs a user-first, alternating conversation: drop leading assistant turns, merge repeats.
 * Only the last AGENT_MAX_HISTORY messages are kept, each trimmed to AGENT_MAX_MESSAGE_CHARS.
 */
export function historyToMessages(history: AgentHistory, message: string): Anthropic.Messages.MessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of [...history.slice(-AGENT_MAX_HISTORY), { role: "user" as const, content: message }]) {
    const content = clip(h.content.trim());
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
  let spent = 0;

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    if (spent >= AGENT_TOKEN_BUDGET) break;
    chargeAiCall(); // global daily ceiling of Claude requests (src/server/ai/budget.ts)
    const res = await client.messages
      .create({
        model: modelFor("fast"),
        max_tokens: AGENT_MAX_OUTPUT_TOKENS,
        system: AGENT_SYSTEM_PROMPT,
        messages,
        tools,
        tool_choice: { type: "auto" },
        output_config: { effort: "low" },
      })
      .catch((e: unknown) => {
        throw new AiError(e instanceof Error ? e.message : String(e), "api");
      });

    spent += (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);
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
        if (!isExpectedToolError(e)) console.error(`[agent] ${use.name} failed:`, e);
        toolCalls.push({ name: use.name, input: use.input, ok: false });
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: toolErrorMessage(e, deps.ctx.caller) });
      }
    }
    messages.push({ role: "user", content: results });
  }

  // Out of iterations: report what was done rather than failing the turn.
  const done = summaries.length ? summaries.join("\n\n") : "No he podido terminar la tarea.";
  return { reply: `${done}\n\nHe llegado al límite de pasos por mensaje; dime cómo quieres seguir.`, toolCalls };
}
