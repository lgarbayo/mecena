/**
 * Mock-mode agent (no ANTHROPIC_API_KEY): a deterministic keyword router over the same 8 tools.
 * Precedence: tribunal/puntúa → score_application; solicitud → draft_application; dossier → build_dossier
 * (+ "pdf" → export_dossier_pdf); explica/bases/requisitos about a known call → explain_call;
 * convocatoria/beca/ayuda/premio/residencia/subvención → search_calls; perfil → get_profile.
 */
import type { Call, ToolContext, ToolName } from "@/contracts";
import { listCalls, readDb } from "@/server/store";
import { summarizeToolResult, toolErrorMessage } from "@/tools/present";
import type { AgentToolCall, AgentTurn, RunToolFn } from "./types";

export const MOCK_HELP =
  "Puedo buscar convocatorias que encajen contigo, explicarte unas bases, prepararte el dossier (también en PDF), redactar la solicitud y pasarla por el tribunal simulado. Prueba con «¿qué convocatorias encajan conmigo?» o «hazme el dossier para los Premios Qué! Arte».";

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
/** "artes plásticas" and "arte plástica" are the same words: drop a plural -s (accents are already folded). */
const singular = (w: string) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);
const tokens = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean).map(singular);

const STOPWORDS = new Set(
  ["para", "convocatoria", "fixture", "ayuda", "beca", "premio", "pequeno", "sobre", "hazme", "prepara", "preparame", "dossier", "solicitud", "esta", "este", "como", "con", "las", "los", "del", "una", "uno", "explicame", "bases", "quiero"].map(singular),
);
/** Distinctive words: long enough and not generic call vocabulary. */
const words = (s: string) => tokens(s).filter((w) => w.length > 3 && !STOPWORDS.has(w));

/** Length of the longest run of consecutive words the message and the title share ("arte plastica" = 2). */
function longestSharedRun(said: string[], title: string[]): number {
  let best = 0;
  for (let i = 0; i < said.length; i++)
    for (let j = 0; j < title.length; j++) {
      let k = 0;
      while (said[i + k] !== undefined && said[i + k] === title[j + k]) k++;
      best = Math.max(best, k);
    }
  return best;
}

const STATUS_RANK: Record<Call["status"], number> = { open: 0, upcoming: 1, recurring: 2, closed: 3 };

/**
 * Find the call the user is talking about: by id, otherwise by distinctive title/organizer words (plurals and
 * accents folded). Ties go to the call whose title contains the longest stretch of the message word for word,
 * then to the one you can still apply to (open, upcoming…), then to the soonest deadline.
 */
export function resolveCallId(message: string): string | undefined {
  const m = fold(message);
  const calls = listCalls();
  const byId = calls.find((c) => m.includes(fold(c.id)));
  if (byId) return byId.id;
  const said = new Set(words(message));
  const saidTokens = tokens(message);
  let best: { call: Call; score: number } | undefined;
  for (const c of calls) {
    const hits = new Set(words(`${c.title} ${c.organizer}`).filter((w) => said.has(w))).size;
    if (!hits) continue;
    const run = longestSharedRun(saidTokens, tokens(c.title));
    const score = hits + (run >= 2 ? run : 0);
    const better =
      !best ||
      score > best.score ||
      (score === best.score &&
        (STATUS_RANK[c.status] - STATUS_RANK[best.call.status] || (c.deadline ?? "9999").localeCompare(best.call.deadline ?? "9999")) < 0);
    if (better) best = { call: c, score };
  }
  return best?.call.id;
}

function latestApplicationId(profileId: string | undefined): string | undefined {
  if (!profileId) return undefined;
  const db = readDb();
  return db.applications.filter((a) => a.profileId === profileId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id;
}

type Plan = { tool: ToolName; input: Record<string, unknown>; lead?: string } | { reply: string };

/** `profileId`: the caller's active profile (its latest application is the one the jury scores). */
export function planMockTurn(message: string, profileId?: string): Plan {
  const m = fold(message);
  const callId = resolveCallId(message);

  if (/tribunal|puntua|puntuacion|\bnota\b|evalua|jurado/.test(m)) {
    const applicationId = latestApplicationId(profileId);
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
  const plan = planMockTurn(message, ctx.profileId);
  if ("reply" in plan) return { reply: plan.reply, toolCalls: [] };
  const call: AgentToolCall = { name: plan.tool, input: plan.input, ok: true };
  try {
    const out = await run(plan.tool, plan.input, ctx);
    return { reply: summarizeToolResult(plan.tool, out as never), toolCalls: [call] };
  } catch (e) {
    return { reply: toolErrorMessage(e, ctx.caller), toolCalls: [{ ...call, ok: false }] };
  }
}
