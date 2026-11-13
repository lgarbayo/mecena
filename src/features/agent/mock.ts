/**
 * Mock-mode agent (no ANTHROPIC_API_KEY): a deterministic keyword router over the same 8 tools.
 * Precedence: tribunal/puntúa → score_application; solicitud → draft_application; dossier → build_dossier
 * (+ "pdf" → export_dossier_pdf); explica/bases/requisitos about a known call → explain_call;
 * convocatoria/beca/ayuda/premio/residencia/subvención → search_calls; perfil → get_profile.
 */
import type { ToolContext, ToolName } from "@/contracts";
import { listCalls, readDb, getMeta } from "@/server/store";
import { summarizeToolResult, toolErrorMessage } from "@/tools/present";
import type { AgentToolCall, AgentTurn, RunToolFn } from "./types";

export const MOCK_HELP =
  "Puedo buscar convocatorias que encajen contigo, explicarte unas bases, prepararte el dossier (también en PDF), redactar la solicitud y pasarla por el tribunal simulado. Prueba con «¿qué convocatorias encajan conmigo?» o «hazme el dossier para la convocatoria de artes plásticas».";

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const STOPWORDS = new Set(["para", "convocatoria", "convocatorias", "fixture", "ayuda", "ayudas", "beca", "becas", "premio", "premios", "pequenos", "sobre", "hazme", "prepara", "preparame", "dossier", "solicitud", "esta", "este", "como", "con", "las", "los", "del", "una", "uno"]);
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));

/** Find the call the user is talking about: by id, otherwise by distinctive title words. */
export function resolveCallId(message: string): string | undefined {
  const m = fold(message);
  const calls = listCalls();
  const byId = calls.find((c) => m.includes(fold(c.id)));
  if (byId) return byId.id;
  const said = new Set(words(message));
  let best: { id: string; hits: number } | undefined;
  for (const c of calls) {
    const hits = new Set(words(`${c.title} ${c.organizer}`).filter((w) => said.has(w))).size;
    if (hits > 0 && (!best || hits > best.hits)) best = { id: c.id, hits };
  }
  return best?.id;
}

function latestApplicationId(): string | undefined {
  const db = readDb();
  const pid = getMeta().activeProfileId;
  return db.applications.filter((a) => a.profileId === pid).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id;
}

type Plan = { tool: ToolName; input: Record<string, unknown>; lead?: string } | { reply: string };

export function planMockTurn(message: string): Plan {
  const m = fold(message);
  const callId = resolveCallId(message);

  if (/tribunal|puntua|puntuacion|\bnota\b|evalua|jurado/.test(m)) {
    const applicationId = latestApplicationId();
    if (!applicationId) return { reply: "Todavía no tienes ninguna solicitud preparada. Dime para qué convocatoria quieres que te la redacte y después la paso por el tribunal." };
    return { tool: "score_application", input: { applicationId } };
  }
  if (/solicitud|redacta/.test(m)) {
    if (!callId) return { reply: "¿Para qué convocatoria quieres la solicitud? Dime su nombre o pídeme primero «¿qué convocatorias encajan conmigo?»." };
    return { tool: "draft_application", input: { callId } };
  }
  if (/dossier|portfolio|porfolio/.test(m)) {
    if (/pdf|descarga|exporta/.test(m)) return { tool: "export_dossier_pdf", input: callId ? { callId } : {} };
    return { tool: "build_dossier", input: callId ? { callId } : {} };
  }
  if (callId && /explica|bases|requisitos|plazo|cuanto|quien puede/.test(m)) return { tool: "explain_call", input: { callId } };
  if (/convocatoria|beca|ayuda|premio|residencia|subvencion|certamen/.test(m)) return { tool: "search_calls", input: { limit: 5 } };
  if (/perfil|quien soy/.test(m)) return { tool: "get_profile", input: {} };
  return { reply: MOCK_HELP };
}

export async function runMockAgent(message: string, run: RunToolFn, ctx: ToolContext): Promise<AgentTurn> {
  const plan = planMockTurn(message);
  if ("reply" in plan) return { reply: plan.reply, toolCalls: [] };
  const call: AgentToolCall = { name: plan.tool, input: plan.input, ok: true };
  try {
    const out = await run(plan.tool, plan.input, ctx);
    return { reply: summarizeToolResult(plan.tool, out as never), toolCalls: [call] };
  } catch (e) {
    return { reply: toolErrorMessage(e), toolCalls: [{ ...call, ok: false }] };
  }
}
