// Deep research (Pro): a Claude agent with Anthropic's server-side web search looks for PRIVATE calls (foundations,
// galleries, associations, festivals) that BDNS does not list, for one profile. Claude only finds and transcribes
// candidates; the service validates them with the Call schema and the rules decide eligibility and score.
import type Anthropic from "@anthropic-ai/sdk";
import { DeepResearchCandidates, type AiSlice, type DeepResearchInput, type DeepResearchResult } from "@/contracts";
import { AiError, anthropic, chargeAiCall, modelFor, structured } from "@/server/ai/llm";

const SYSTEM = `Eres el documentalista de Mecena, que ayuda a artistas, pymes y autónomos de España a encontrar convocatorias.
Tu tarea: buscar en la web premios, becas, residencias, certámenes y concursos PRIVADOS (fundaciones, galerías, museos, asociaciones, festivales, empresas, obra social de bancos) a los que esta persona o empresa pueda presentarse, que estén ABIERTOS hoy o abran pronto.
- No incluyas subvenciones públicas de administraciones: esas ya las sacamos de la BDNS.
- Busca en español, piensa en su disciplina o sector, su zona y lo que quiere financiar.
- Solo convocatorias reales que hayas visto en una página durante la búsqueda: copia la URL exacta de la página de la convocatoria o de sus bases. Nunca inventes URLs, importes ni plazos.
- Si no sabes el plazo exacto, deja "deadline" en null y explica en "deadlineText" lo que dice la página.
- Descarta las que ya han cerrado.
Al terminar, responde SOLO con un objeto JSON (sin texto antes ni después, sin markdown) con esta forma:
{"candidates":[{"title":"","organizer":"","type":"premio|beca|residencia|certamen|convocatoria|ayuda","url":"https://…","deadline":"YYYY-MM-DD o null","deadlineText":"","amountText":"","summary":"2-3 frases en español de España, tuteando","disciplines":[""],"beneficiaryKinds":["creator|business"],"region":"comunidad o provincia si exige residencia, o null","requirements":[""]}]}
Como máximo 8 candidatas, las que mejor encajen primero.`;

function brief(input: DeepResearchInput): string {
  const p = input.profile;
  return JSON.stringify(
    {
      hoy: input.today,
      perfil: {
        tipo: p.kind === "creator" ? "artista/creador" : "pyme/autónomo",
        disciplinas: p.disciplines,
        sector: p.sector,
        zona: [p.city, p.province, p.region].filter(Boolean).join(", "),
        edad: p.birthYear ? new Date(input.today).getFullYear() - p.birthYear : undefined,
        declaracion: p.statement,
        proyecto: p.projectIdea,
        necesidades: p.fundingNeeds,
        logros: p.achievements.slice(0, 5),
      },
    },
    null,
    1,
  );
}

/** The JSON object in the model's final text (it may still wrap it in prose or a code fence). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** Requests that may search (the first one plus resumed pauses); the search budget is split across them. */
const MAX_SEARCH_REQUESTS = 2;

const day = (iso: string, offsetDays: number) => new Date(Date.parse(iso) + offsetDays * 864e5).toISOString().slice(0, 10);

export const deepResearchAi: AiSlice<"deepResearch"> = {
  // Deterministic and offline: one valid candidate, one already closed and one without a source URL, so the
  // service's validation is exercised the same way as with real output.
  mock: {
    async deepResearch(input) {
      const what = input.profile.kind === "business" ? "empresas creativas" : (input.profile.disciplines[0] ?? "artes visuales");
      const url = "https://fundacion-mecena-mock.example.org/convocatorias/premio-2027";
      return {
        candidates: [
          {
            title: `[MOCK] Premio Fundación Ejemplo para ${what}`,
            organizer: "Fundación Ejemplo (ficticia)",
            type: "premio",
            url,
            deadline: day(input.today, 30),
            deadlineText: `Hasta el ${day(input.today, 30)}`,
            amountText: "3.000 €",
            summary: "Convocatoria ficticia del modo sin IA: sirve para probar la búsqueda ampliada.",
            disciplines: input.profile.disciplines.slice(0, 2),
            beneficiaryKinds: [input.profile.kind],
            region: null,
            requirements: ["Residir en España"],
          },
          {
            title: "[MOCK] Certamen ya cerrado",
            organizer: "Galería Ejemplo (ficticia)",
            type: "certamen",
            url: "https://galeria-mock.example.org/certamen",
            deadline: day(input.today, -10),
            deadlineText: "Cerrado",
            amountText: "Exposición",
            summary: "Ya ha cerrado: el servicio debe descartarla.",
            disciplines: [],
            beneficiaryKinds: [input.profile.kind],
            region: null,
            requirements: [],
          },
          {
            title: "[MOCK] Beca sin fuente",
            organizer: "Desconocido",
            type: "beca",
            url: "",
            deadline: null,
            deadlineText: "Consultar bases",
            amountText: "Consultar bases",
            summary: "Sin URL de fuente: el servicio debe descartarla.",
            disciplines: [],
            beneficiaryKinds: [input.profile.kind],
            region: null,
            requirements: [],
          },
        ],
        sourceUrls: [url, "https://galeria-mock.example.org/certamen"],
        searches: 1,
        inputTokens: 0,
        outputTokens: 0,
      };
    },
  },
  real: {
    async deepResearch(input) {
      const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: brief(input) }];
      const sourceUrls = new Set<string>();
      let searches = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let text = "";

      // The tool definition never changes within a run (editing `tools` after a paused turn invalidates its thinking
      // blocks on Opus 5.5). max_uses is enforced per request, so the run's total is bounded by splitting the budget.
      const webSearch: Anthropic.Beta.Messages.BetaWebSearchTool20260209 = {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: Math.max(1, Math.floor(input.maxSearches / MAX_SEARCH_REQUESTS)),
        user_location: { type: "approximate", country: "ES", ...(input.profile.region ? { region: input.profile.region } : {}), timezone: "Europe/Madrid" },
      };

      const send = async (final: boolean) => {
        chargeAiCall(); // global daily ceiling of Claude requests (src/server/ai/budget.ts)
        const res = await anthropic()
          .beta.messages.create({
            model: modelFor("smart"),
            max_tokens: input.maxOutputTokens,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: SYSTEM,
            tools: [webSearch],
            // last request: no more searching, write the answer from what was found
            ...(final ? { tool_choice: { type: "none" as const } } : {}),
            output_config: { effort: "medium" },
            messages,
          })
          .catch((e: unknown) => {
            throw new AiError(e instanceof Error ? e.message : String(e), "api");
          });
        inputTokens += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
        outputTokens += res.usage.output_tokens;
        for (const block of res.content) {
          if (block.type === "server_tool_use" && block.name === "web_search") searches++;
          if (block.type === "web_search_tool_result" && Array.isArray(block.content)) for (const r of block.content) sourceUrls.add(r.url);
        }
        if (res.stop_reason === "refusal") throw new AiError("Claude declined the request", "refusal");
        text = res.content
          .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        return res;
      };

      // A long server-side search turn may pause (pause_turn): resume it, unchanged, while the caps allow.
      let res = await send(false);
      for (let turn = 1; res.stop_reason === "pause_turn" && turn < MAX_SEARCH_REQUESTS; turn++) {
        if (inputTokens + outputTokens >= input.maxTotalTokens) break;
        messages.push({ role: "assistant", content: res.content });
        res = await send(false);
      }
      // Still paused (caps reached): one last request, searches off, so the run ends with an answer.
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        res = await send(true);
      }

      let parsed = DeepResearchCandidates.safeParse(extractJson(text));
      if (!parsed.success && text.trim()) {
        // The answer was not clean JSON: one cheap structuring pass over the text (no new facts, no web).
        const fixed = await structured({
          tier: "fast",
          system: "Convierte esta lista de convocatorias al esquema. Copia los datos tal cual; no añadas convocatorias ni datos que no estén en el texto.",
          schema: DeepResearchCandidates,
          user: text,
          maxTokens: 8000,
          effort: "low",
        });
        parsed = DeepResearchCandidates.safeParse(fixed);
      }
      if (!parsed.success) throw new AiError("Unparseable deep research output", "parse");
      return { candidates: parsed.data.candidates, sourceUrls: [...sourceUrls], searches, inputTokens, outputTokens } satisfies DeepResearchResult;
    },
  },
};
