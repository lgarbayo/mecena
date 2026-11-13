/** WP-04: real-mode agent loop driven by a fake Anthropic client (no API key, no network). */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { TOOL_NAMES } from "@/contracts";
import { AGENT_SYSTEM_PROMPT, MAX_AGENT_ITERATIONS, agentTools, historyToMessages, type AgentLlmClient } from "@/features/agent/real";
import { runAgent } from "@/features/agent/service";
import { AiError } from "@/server/ai/llm";
import { grantPro, seedOnboardedCreator } from "../helpers";

type Params = Anthropic.Messages.MessageCreateParamsNonStreaming;
type Block = Anthropic.Messages.ContentBlock;

const CALL_ID = "fixture-beca-artes-plasticas";

function msg(content: Block[], stop_reason: Anthropic.Messages.StopReason): Anthropic.Messages.Message {
  return { id: "msg", type: "message", role: "assistant", model: "fake", content, stop_reason, stop_sequence: null, usage: {} } as unknown as Anthropic.Messages.Message;
}
const text = (t: string) => ({ type: "text", text: t, citations: null }) as unknown as Block;
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as unknown as Block;

/** Scripted client: returns the given responses in order and records every request (deep-copied). */
function fakeClient(responses: Anthropic.Messages.Message[]) {
  const calls: Params[] = [];
  const client: AgentLlmClient = {
    messages: {
      create: async (p) => {
        calls.push(structuredClone(p));
        const r = responses.shift();
        if (!r) throw new Error("no more scripted responses");
        return r;
      },
    },
  };
  return { client, calls };
}

describe("agent tool definitions", () => {
  it("exposes the 8 tools with JSON Schema inputs from zod", () => {
    const tools = agentTools();
    expect(tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    for (const t of tools) {
      expect(t.input_schema.type).toBe("object");
      expect(t.input_schema).not.toHaveProperty("$schema");
      expect(t.description).toBeTruthy();
    }
    const explain = tools.find((t) => t.name === "explain_call")!;
    expect(explain.input_schema.required).toEqual(["callId"]);
    expect(explain.input_schema.properties).toHaveProperty("profileId");
  });

  it("history becomes a user-first alternating conversation", () => {
    expect(
      historyToMessages(
        [
          { role: "assistant", content: "¡Hola! Soy Mecena." },
          { role: "user", content: "Hola" },
          { role: "user", content: "Soy ilustradora" },
          { role: "assistant", content: "Encantada" },
        ],
        "¿Qué convocatorias hay?",
      ),
    ).toEqual([
      { role: "user", content: "Hola\n\nSoy ilustradora" },
      { role: "assistant", content: "Encantada" },
      { role: "user", content: "¿Qué convocatorias hay?" },
    ]);
  });
});

describe("runAgent (real mode, fake client)", () => {
  it("runs the tool loop: smart model, auto tool_choice, Spanish system prompt, tool results fed back", async () => {
    await seedOnboardedCreator();
    const { client, calls } = fakeClient([
      msg([text("Voy a preparar tu dossier."), toolUse("t1", "build_dossier", { callId: CALL_ID })], "tool_use"),
      msg([toolUse("t2", "export_dossier_pdf", { callId: CALL_ID })], "tool_use"),
      msg([text("Aquí tienes tu dossier para la beca: http://localhost:3000/dossier")], "end_turn"),
    ]);
    const turn = await runAgent("Hazme el dossier para la convocatoria de artes plásticas", [], { client });

    expect(turn.reply).toMatch(/^Aquí tienes tu dossier/);
    expect(turn.toolCalls).toEqual([
      { name: "build_dossier", input: { callId: CALL_ID }, ok: true },
      { name: "export_dossier_pdf", input: { callId: CALL_ID }, ok: true },
    ]);
    expect(calls).toHaveLength(3);
    for (const p of calls) {
      expect(p.model).toBe("claude-opus-5-5");
      expect(p.tool_choice).toEqual({ type: "auto" });
      expect(p.system).toBe(AGENT_SYSTEM_PROMPT);
      expect(p.tools).toHaveLength(8);
    }
    expect(AGENT_SYSTEM_PROMPT).toContain("Mecena prepara; tú presentas");
    // second request carries the assistant tool_use + the user tool_result with summary + JSON
    const second = calls[1].messages;
    expect(second).toHaveLength(3);
    expect(second[1].role).toBe("assistant");
    const result = (second[2].content as Anthropic.Messages.ToolResultBlockParam[])[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(result.is_error).toBeUndefined();
    expect(String(result.content)).toContain("Adaptado a la convocatoria");
    expect(String(result.content)).toContain('"variant"');
  });

  it("returns tool errors to Claude as is_error tool_result (paywall)", async () => {
    await seedOnboardedCreator();
    const { client, calls } = fakeClient([
      msg([toolUse("t1", "draft_application", { callId: CALL_ID })], "tool_use"),
      msg([text("Para redactarla necesitas Mecena Pro: http://localhost:3000/pro")], "end_turn"),
    ]);
    const turn = await runAgent("Prepárame la solicitud", [], { client });
    expect(turn.toolCalls).toEqual([{ name: "draft_application", input: { callId: CALL_ID }, ok: false }]);
    const result = (calls[1].messages[2].content as Anthropic.Messages.ToolResultBlockParam[])[0];
    expect(result.is_error).toBe(true);
    expect(String(result.content)).toMatch(/^Necesitas Mecena Pro.*\/pro/);
  });

  it("bad tool input and unknown tools are is_error results too, and the loop continues", async () => {
    await grantPro();
    const { client, calls } = fakeClient([
      msg([toolUse("t1", "explain_call", {}), toolUse("t2", "delete_everything", {})], "tool_use"),
      msg([text("¿De qué convocatoria hablamos?")], "end_turn"),
    ]);
    const turn = await runAgent("Explícame las bases", [], { client });
    expect(turn.toolCalls.map((t) => t.ok)).toEqual([false, false]);
    const results = calls[1].messages[2].content as Anthropic.Messages.ToolResultBlockParam[];
    expect(results.map((r) => r.is_error)).toEqual([true, true]);
    expect(String(results[0].content)).toMatch(/Datos de entrada no válidos/);
    expect(String(results[1].content)).toMatch(/Herramienta desconocida/);
  });

  it(`stops after ${MAX_AGENT_ITERATIONS} iterations and reports what was done`, async () => {
    await seedOnboardedCreator();
    const loops = Array.from({ length: 10 }, (_, i) => msg([toolUse(`t${i}`, "get_profile", {})], "tool_use"));
    const { client, calls } = fakeClient(loops);
    const turn = await runAgent("Bucle", [], { client });
    expect(calls).toHaveLength(MAX_AGENT_ITERATIONS);
    expect(turn.toolCalls).toHaveLength(MAX_AGENT_ITERATIONS);
    expect(turn.reply).toMatch(/límite de pasos/);
  });

  it("uses a custom tool runner and passes the caller context", async () => {
    const seen: unknown[] = [];
    const { client } = fakeClient([msg([toolUse("t1", "search_calls", { query: "residencia" })], "tool_use"), msg([text("Listo.")], "end_turn")]);
    const turn = await runAgent("Residencias", [], {
      client,
      appUserId: "rc-user-1",
      run: async (name, input, ctx) => {
        seen.push({ name, input, ctx });
        return { results: [] };
      },
    });
    expect(turn.reply).toBe("Listo.");
    expect(seen).toEqual([{ name: "search_calls", input: { query: "residencia" }, ctx: { caller: "app", appUserId: "rc-user-1" } }]);
  });

  it("refusals get a Spanish reply; API failures surface as AiError", async () => {
    const refused = fakeClient([msg([], "refusal")]);
    expect((await runAgent("x", [], { client: refused.client })).reply).toMatch(/^Lo siento/);

    const broken: AgentLlmClient = { messages: { create: async () => Promise.reject(new Error("overloaded")) } };
    await expect(runAgent("x", [], { client: broken })).rejects.toBeInstanceOf(AiError);
  });
});
