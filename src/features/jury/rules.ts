// Owned by WP-08. Judges, estimated criteria and the deterministic point allocation used by the jury mock.
import type { Application, Call, CallCriterion, JudgePersona, ProfileKind } from "@/contracts";
import { needsBudget } from "@/features/drafting/rules";

export const CREATOR_JUDGES: JudgePersona[] = [
  { id: "tecnica", name: "Técnica de la administración", focus: "Cumplimiento de las bases, presupuesto y documentación" },
  { id: "comisaria", name: "Comisaria independiente", focus: "Calidad, originalidad y coherencia del proyecto artístico" },
  { id: "gestor", name: "Gestor cultural", focus: "Impacto, público y viabilidad" },
];

export const BUSINESS_JUDGES: JudgePersona[] = [
  { id: "tecnico-agencia", name: "Técnico de la agencia", focus: "Cumplimiento de las bases, gastos admitidos y documentación" },
  { id: "consultora", name: "Consultora de innovación", focus: "Viabilidad técnica y económica del proyecto" },
  { id: "evaluador-impacto", name: "Evaluador de impacto", focus: "Competitividad, empleo y efecto en el territorio" },
];

/** Personas follow who is applying (some calls, e.g. crafts, admit both creators and businesses). */
export const judgesFor = (kind: ProfileKind): JudgePersona[] => (kind === "creator" ? CREATOR_JUDGES : BUSINESS_JUDGES);

/** When the bases publish no scored criteria, the jury uses these (shown as "estimados"). */
export function estimatedCriteria(kind: ProfileKind): CallCriterion[] {
  return kind === "creator"
    ? [
        { id: "calidad", name: "Calidad y coherencia de la propuesta", description: "Criterio estimado: las bases no publican puntuaciones", maxPoints: 40 },
        { id: "proyecto", name: "Claridad y viabilidad del proyecto", description: "Criterio estimado", maxPoints: 35 },
        { id: "documentacion", name: "Ajuste a las bases y documentación", description: "Criterio estimado", maxPoints: 25 },
      ]
    : [
        { id: "viabilidad", name: "Viabilidad técnica y económica", description: "Criterio estimado: las bases no publican puntuaciones", maxPoints: 40 },
        { id: "impacto", name: "Impacto en la competitividad y el empleo", description: "Criterio estimado", maxPoints: 35 },
        { id: "documentacion", name: "Ajuste a las bases y documentación", description: "Criterio estimado", maxPoints: 25 },
      ];
}

/**
 * Criteria the jury scores and whether they are estimated: the bases publish none, or the call data marks them as
 * inferred (criteriaSource "estimated"). Estimated criteria are never called "oficiales".
 */
export const criteriaFor = (call: Call, kind: ProfileKind) => ({
  criteria: call.criteria.length ? call.criteria : estimatedCriteria(kind),
  estimated: call.criteria.length === 0 || call.criteriaSource === "estimated",
});

const gapCount = (sections: readonly { body: string }[]) => sections.reduce((n, s) => n + (s.body.match(/\[Completa:/g)?.length ?? 0), 0);
const contentKey = (a: Pick<Application, "sections" | "budget">) => JSON.stringify([a.sections.map((s) => [s.key, s.body]), a.budget]);

export const MOCK_DRAFT_TOTAL = 61;
export const MOCK_REVISED_TOTAL = 84;

/**
 * The mock jury's target total, from the content (deterministic, offline demo):
 * - a draft scores 61 (minus 6 if the call needs a budget and it is empty);
 * - after "Aplicar mejoras" it rises towards 84 in proportion to the fixes really applied (accepted / proposed), only
 *   if the text changed, minus 2 per new "[Completa: …]" gap the revision left and 6 for an empty budget the call needs.
 * A "reviewed" application without revision data (hand-made demo seeds) scores 84.
 */
export function mockTarget(app: Pick<Application, "status" | "sections" | "budget"> & Partial<Pick<Application, "revision" | "previous">>, call?: Pick<Call, "type" | "allowedExpenses">): number {
  const emptyBudget = call && app.budget.length === 0 && needsBudget(call) ? 6 : 0;
  if (app.status !== "reviewed") return MOCK_DRAFT_TOTAL - emptyBudget;
  const r = app.revision;
  if (!r) return MOCK_REVISED_TOTAL - emptyBudget;
  const base = Math.min(r.baseTotal, MOCK_REVISED_TOTAL);
  const before = app.previous;
  if (before && contentKey(before) === contentKey(app)) return Math.round(base);
  const share = r.proposed > 0 ? Math.min(1, r.fixes.length / r.proposed) : 0;
  const newGaps = before ? Math.max(0, gapCount(app.sections) - gapCount(before.sections)) : 0;
  return Math.max(0, Math.min(MOCK_REVISED_TOTAL, Math.round(base + (MOCK_REVISED_TOTAL - base) * share) - 2 * newGaps - emptyBudget));
}

const V1 = [0.72, 0.52, 0.66, 0.5, 0.62, 0.58];
const V2 = [0.88, 0.8, 0.86, 0.82, 0.84, 0.83];

/**
 * Points per criterion (tenths) so that round(sum / max * 100) === target exactly.
 * v1 leaves some criteria visibly weaker (those get the fixes); v2 lifts them.
 */
export function allocate(criteria: readonly CallCriterion[], target: number): number[] {
  const shape = target >= 75 ? V2 : V1;
  const max = criteria.reduce((s, c) => s + c.maxPoints, 0);
  const goal = Math.round((target * max) / 10); // in tenths of a point
  const raw = criteria.map((c, i) => c.maxPoints * 10 * shape[i % shape.length]);
  const scale = goal / raw.reduce((s, x) => s + x, 0);
  const scaled = raw.map((x, i) => Math.min(criteria[i].maxPoints * 10, x * scale));
  const out = scaled.map(Math.floor);
  let rest = goal - out.reduce((s, x) => s + x, 0);
  const order = scaled.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0 && k < order.length * 4; k++) {
    const i = order[k % order.length][1];
    if (out[i] < criteria[i].maxPoints * 10) {
      out[i] += 1;
      rest--;
    }
  }
  return out.map((t) => t / 10);
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * One judge's points around the panel average: judges differ by up to ~6 % of each criterion, the offsets cancel
 * out across the three of them, so the averaged total still hits the target exactly.
 */
export function judgeSpread(criteria: readonly CallCriterion[], points: readonly number[], judgeIndex: number): number[] {
  return points.map((p, i) => {
    const max = criteria[i].maxPoints;
    const d = Math.min(Math.round(max * 0.6) / 10 || 0.1, max - p, p);
    const sign = [1, -1, 0][(judgeIndex + i) % 3];
    return Math.round((p + sign * Math.max(0, d)) * 10) / 10;
  });
}

/** Visual criteria (artistic quality, originality, composition…): the judges only read the written application. */
export const isVisualCriterion = (c: Pick<CallCriterion, "name">) => /artistic|original|creativ|estetic|plastic|visual|composic|grafic|obra|expresiv|diseno/.test(fold(c.name));

export const GENERIC_FIX = "Abre la memoria con un resumen de dos o tres frases: qué propones, desde dónde y qué saldrá de ello.";

/** Concrete, actionable fixes tied to what the draft already says (each one the mock revision can act on). */
export function fixesFor(criterion: CallCriterion, app: Application): string[] {
  const n = fold(`${criterion.name} ${criterion.description}`);
  // Generic criteria ("Valoración del jurado", "Valoración del comité de selección"…): make the proposal easy to judge.
  if (/^(valoracion|criterio|juicio|decision)\b.*\b(jurado|comite|comision)/.test(fold(criterion.name)) || /^valoracion (global|general)/.test(fold(criterion.name))) return [GENERIC_FIX];
  const body = (key: string) => app.sections.find((s) => s.key === key)?.body ?? "";
  const firstLine = (app.sections.find((s) => s.key === "statement" || s.key === "company")?.body ?? "").split(/[.\n]/)[0].trim();
  const echo = firstLine ? ` Parte de lo que ya dices: «${firstLine.slice(0, 70)}${firstLine.length > 70 ? "…" : ""}».` : "";
  if (/impacto visual|comunicativ|soporte|difusion|reproduc|adaptab|legib/.test(n))
    return ["Explica cómo funciona tu propuesta en distintos formatos y tamaños, citando la técnica y las medidas de tus obras."];
  if (/viabil|proyecto|interes|plan|calendar|coheren/.test(n))
    return ["Añade un calendario por fases (inicio, producción, cierre) con fechas reales.", "Explica a qué se destina cada partida del presupuesto y por qué es necesaria."];
  if (/original|creativ|innova|singular/.test(n)) return [`Cuenta qué hace única tu mirada en una o dos frases propias.${echo}`];
  if (/calidad|artistic|tecnic|trayectoria|curric|merit|composic|grafic|expresiv|diseno/.test(n))
    return [`Cita 2 o 3 logros de tu trayectoria con año y lugar (ya mencionas ${body("cv") ? "algunos en tu CV" : "tu experiencia"}).`, "Relaciona tu técnica con el proyecto: qué materiales usas y por qué."];
  if (/territor|vincula|local|galicia|municip|zona|patrimon|jornada|fiesta|carnaval|tema|adecuac/.test(n))
    return ["Explica la relación del proyecto con el territorio y con el tema de la convocatoria: dónde trabajas, qué lugares y personas aparecen."];
  if (/impacto|empleo|competitiv|public|social/.test(n)) return ["Cuantifica el impacto esperado: público, ventas, clientes o empleo en los próximos 12 meses.", "Indica quién se beneficia del proyecto además de ti."];
  if (/presupuest|document|bases|ajuste/.test(n)) return ["Completa los huecos marcados con [Completa: …] y adjunta los certificados de Hacienda y Seguridad Social."];
  return [GENERIC_FIX];
}
