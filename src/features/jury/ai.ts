// Owned by WP-08. Judges score the official criteria; revise applies accepted fixes using only the user's facts.
// Mock: exactly 61 for a fresh draft and 84 once revised (see ./rules.allocate). Real: Claude smart tier.
import { ApplicationDraftContent, JudgeVerdict, type AiSlice, type Application, type ApplicationSection, type Call, type TranscriptSegment } from "@/contracts";
import { enforce } from "@/features/drafting/rules";
import { structured } from "@/server/ai/llm";
import { polishProse, WORDING_RULE } from "@/server/ai/wording";
import { allocate, fixesFor, mockTarget } from "./rules";

const COMMENT: Record<string, [string, string]> = {
  // [weak, strong]
  tecnica: ["Cumple lo básico, pero faltan datos que las bases piden.", "Se ajusta a las bases y el presupuesto está justificado."],
  comisaria: ["La idea tiene fuerza, aunque la memoria no la desarrolla del todo.", "Propuesta coherente y con voz propia."],
  gestor: ["No queda claro el calendario ni a quién llega el proyecto.", "Se entiende cómo se hará y a quién llega."],
  "tecnico-agencia": ["Faltan justificantes y concreción de los gastos.", "Gastos admitidos y bien justificados."],
  consultora: ["El plan es razonable pero sin cifras que lo sostengan.", "Plan viable y bien dimensionado."],
  "evaluador-impacto": ["El impacto no está cuantificado.", "Impacto claro y medible."],
};

function mockVerdict(call: Call, application: Application, judgeId: string) {
  const points = allocate(call.criteria, mockTarget(application));
  return {
    judgeId,
    scores: call.criteria.map((c, i) => {
      const ratio = points[i] / c.maxPoints;
      const [weak, strong] = COMMENT[judgeId] ?? ["Mejorable.", "Bien resuelto."];
      return { criterionId: c.id, points: points[i], comment: ratio < 0.7 ? weak : strong, fixes: ratio < 0.7 ? fixesFor(c, application) : [] };
    }),
    overall: mockTarget(application) >= 80 ? "La solicitud responde bien a los criterios." : "Buena base: con algunos datos concretos subiría mucho.",
  };
}

const euros = (n: number) => `${n.toLocaleString("es-ES")} €`;

/** Mock revision: each accepted fix adds text built only from facts already in the draft, profile transcript or budget. */
function mockRevise(application: Application, transcript: TranscriptSegment[], fixes: string[]): ApplicationDraftContent {
  const sections: ApplicationSection[] = application.sections.map((s) => ({ ...s, sourceSegmentIds: [...s.sourceSegmentIds] }));
  const get = (key: string) => sections.find((s) => s.key === key) ?? sections[0];
  const add = (key: string, text: string, segIds: string[] = []) => {
    const s = get(key);
    if (s.body.includes(text)) return;
    s.body = `${s.body}\n\n${text}`;
    s.sourceSegmentIds = [...new Set([...s.sourceSegmentIds, ...segIds])];
  };
  const all = fixes.join(" ").toLowerCase();
  if (/calendario|partida|presupuesto/.test(all) && application.budget.length) {
    add("memoria", `Destino del presupuesto: ${application.budget.map((b) => `${b.concept.toLowerCase()} (${euros(b.amountEur)}, ${b.expenseType})`).join("; ")}.`);
    add("memoria", "Fases: preparación, producción y cierre con presentación pública. [Completa: fechas de cada fase]");
  }
  if (/trayectoria|logros/.test(all)) {
    const cv = sections.find((s) => s.key === "cv" || s.key === "company");
    const items = (cv?.body ?? "").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
    if (items.length) add("memoria", `Mi trayectoria respalda el proyecto: ${items.join("; ")}.`);
  }
  if (/territorio|lugares/.test(all)) {
    const place = transcript.filter((t) => /de [A-ZÁÉÍÓÚ]|en [A-ZÁÉÍÓÚ]|malpica|coruña|galicia/i.test(t.text));
    if (place.length) add("memoria", `Vínculo con el territorio: ${place.map((p) => polishProse(p.text)).join(" ")}`, place.map((p) => p.id));
  }
  if (/única|mirada|propias/.test(all)) {
    const voice = transcript.filter((t) => /porque/i.test(t.text));
    if (voice.length) add("statement", `Lo que hace distinta mi mirada: ${voice.map((v) => polishProse(v.text)).join(" ")}`, voice.map((v) => v.id));
  }
  if (/impacto|beneficia/.test(all)) add(sections.some((s) => s.key === "objetivos") ? "objetivos" : "memoria", "A quién llega: [Completa: público, clientes o colectivos que se benefician y cuántos]");
  return { sections, budget: application.budget, checklist: application.checklist };
}

const JUDGE_SYSTEM = `Eres miembro de una comisión de valoración de convocatorias en España. Puntúas una solicitud con los criterios oficiales de las bases.
Para cada criterio: puntos entre 0 y su máximo (sé exigente y realista: un borrador sin datos concretos no saca más del 70 %), un comentario de una línea y 1-2 mejoras concretas que la persona pueda hacer con sus propios datos (nunca pidas inventar).
Español de España. "overall": una frase de valoración global.`;

const REVISE_SYSTEM = `Eres Mecena. Revisas una solicitud aplicando las mejoras aceptadas por la persona.
Usa SOLO hechos presentes en la transcripción o en la solicitud actual; mantén su voz y sus frases, sin erratas. Si una mejora necesita un dato que no está, escribe "[Completa: qué falta]" en vez de inventarlo.
Conserva las claves de sección y actualiza sourceSegmentIds con los fragmentos usados. Presupuesto solo con gastos admitidos. Español de España.
${WORDING_RULE}`;

export const juryAi: AiSlice<"judgeApplication" | "reviseApplication"> = {
  mock: {
    async judgeApplication({ call, application, judge }) {
      return mockVerdict(call, application, judge.id);
    },
    async reviseApplication({ application, transcript, fixes }) {
      return mockRevise(application, transcript, fixes);
    },
  },
  real: {
    async judgeApplication({ call, application, judge }) {
      return structured({
        tier: "smart",
        system: `${JUDGE_SYSTEM}\nTu perfil: ${judge.name}. Te fijas sobre todo en: ${judge.focus}. Tu judgeId es "${judge.id}".`,
        schema: JudgeVerdict,
        maxTokens: 6000,
        user: JSON.stringify(
          {
            convocatoria: { titulo: call.title, resumen: call.summary, criterios: call.criteria, gastosAdmitidos: call.allowedExpenses, importeMaximo: call.amountEur.max ?? null },
            solicitud: { secciones: application.sections.map((s) => ({ titulo: s.title, texto: s.body })), presupuesto: application.budget },
          },
          null,
          1,
        ),
      });
    },
    async reviseApplication({ call, application, transcript, fixes }) {
      const content = await structured({
        tier: "smart",
        system: REVISE_SYSTEM,
        schema: ApplicationDraftContent,
        user: JSON.stringify(
          {
            mejorasAceptadas: fixes,
            solicitudActual: { sections: application.sections, budget: application.budget, checklist: application.checklist },
            transcripcion: transcript.map((s) => ({ id: s.id, texto: s.text })),
            convocatoria: { criterios: call.criteria, gastosAdmitidos: call.allowedExpenses, importeMaximo: call.amountEur.max ?? null, documentos: call.requiredDocuments },
          },
          null,
          1,
        ),
      });
      return enforce(content, call, transcript.map((s) => s.id));
    },
  },
};
