// Owned by WP-06. Claude (fast tier) rewrites the deterministic rule output as plain Spanish bullets.
// It never decides eligibility or score: those come from ./rules and are kept by the service.
import { ExplainFitResult, type AiSlice, type Call, type Profile } from "@/contracts";
import { structured } from "@/server/ai/llm";

const SYSTEM = `Eres Mecena, que ayuda a artistas, pymes y autónomos de España a encontrar convocatorias (becas, premios, ayudas).
Escribe en español de España, tuteando, con frases cortas y claras.
Recibes un perfil, una convocatoria y las razones y carencias que ya ha calculado un motor de reglas.
- "whyYouFit": hasta 4 viñetas sobre por qué encaja. Conecta la convocatoria con lo que la persona ha contado (su proyecto, su obra, su negocio) usando sus propias palabras cuando puedas.
- "whatYouMiss": hasta 4 viñetas con lo que le falta o debe confirmar. Conserva TODAS las carencias de las reglas que empiezan por "Piden", "Te falta" o "Confírmalo" (puedes reformularlas, nunca suavizarlas ni eliminarlas si caben).
- "plainSummary": 2-3 frases: quién puede pedirla, cuánto da, hasta cuándo y qué piden.
Nunca inventes datos que no estén en el perfil o en la convocatoria. No prometas resultados ni des probabilidades.`;

function brief(profile: Profile, call: Call) {
  return {
    perfil: {
      tipo: profile.kind === "creator" ? "artista/creador" : "pyme/autónomo",
      nombre: profile.displayName,
      zona: [profile.city, profile.province, profile.region].filter(Boolean).join(", "),
      disciplinas: profile.disciplines,
      sector: profile.sector,
      declaracion: profile.statement,
      proyecto: profile.projectIdea,
      necesidades: profile.fundingNeeds,
      logros: profile.achievements,
    },
    convocatoria: {
      titulo: call.title,
      organiza: call.organizer,
      importe: call.amountText,
      plazo: call.deadlineText,
      resumen: call.summary,
      requisitos: call.eligibility,
      documentos: call.requiredDocuments,
      criterios: call.criteria.map((c) => `${c.name} (${c.maxPoints} ptos)`),
    },
  };
}

export const matchingAi: AiSlice<"explainFit"> = {
  mock: {
    async explainFit({ call, ruleReasons, ruleMissing }) {
      return { whyYouFit: ruleReasons.slice(0, 4), whatYouMiss: ruleMissing.slice(0, 4), plainSummary: call.summary };
    },
  },
  real: {
    async explainFit({ profile, call, ruleReasons, ruleMissing }) {
      return structured({
        tier: "fast",
        system: SYSTEM,
        schema: ExplainFitResult,
        maxTokens: 2000,
        user: JSON.stringify({ ...brief(profile, call), reglas: { porQueEncaja: ruleReasons, loQueFalta: ruleMissing } }, null, 1),
      });
    },
  },
};
