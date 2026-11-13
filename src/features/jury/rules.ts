// Owned by WP-08. Judges, estimated criteria and the deterministic point allocation used by the jury mock.
import type { Application, Call, CallCriterion, JudgePersona, ProfileKind } from "@/contracts";

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

export const criteriaFor = (call: Call, kind: ProfileKind) => ({ criteria: call.criteria.length ? call.criteria : estimatedCriteria(kind), estimated: call.criteria.length === 0 });

/** The mock jury's target: 61 for a fresh draft, 84 once the jury's fixes were applied ("reviewed"). */
export const mockTarget = (app: Pick<Application, "status">) => (app.status === "reviewed" ? 84 : 61);

const V1 = [0.72, 0.52, 0.66, 0.5, 0.62, 0.58];
const V2 = [0.88, 0.8, 0.86, 0.82, 0.84, 0.83];

/**
 * Points per criterion (tenths) so that round(sum / max * 100) === target exactly.
 * v1 leaves some criteria visibly weaker (those get the fixes); v2 lifts them.
 */
export function allocate(criteria: readonly CallCriterion[], target: number): number[] {
  const shape = target >= 80 ? V2 : V1;
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

/** Concrete, actionable fixes tied to what the draft already says. */
export function fixesFor(criterion: CallCriterion, app: Application): string[] {
  const n = fold(`${criterion.name} ${criterion.description}`);
  const body = (key: string) => app.sections.find((s) => s.key === key)?.body ?? "";
  const firstLine = (app.sections.find((s) => s.key === "statement" || s.key === "company")?.body ?? "").split(/[.\n]/)[0].trim();
  const echo = firstLine ? ` Parte de lo que ya dices: «${firstLine.slice(0, 70)}${firstLine.length > 70 ? "…" : ""}».` : "";
  if (/viabil|proyecto|interes|plan|calendar|coheren/.test(n))
    return ["Añade un calendario por fases (inicio, producción, cierre) con fechas reales.", "Explica a qué se destina cada partida del presupuesto y por qué es necesaria."];
  if (/calidad|artistic|tecnic|trayectoria|curric|merit/.test(n))
    return [`Cita 2 o 3 logros de tu trayectoria con año y lugar (ya mencionas ${body("cv") ? "algunos en tu CV" : "tu experiencia"}).`, `Relaciona tu técnica con el proyecto.${echo}`];
  if (/territor|vincula|local|galicia|municip|zona|patrimon/.test(n)) return ["Explica la relación del proyecto con el territorio: dónde trabajas, qué lugares y personas aparecen."];
  if (/impacto|empleo|competitiv|public|social/.test(n)) return ["Cuantifica el impacto esperado: público, ventas, clientes o empleo en los próximos 12 meses.", "Indica quién se beneficia del proyecto además de ti."];
  if (/original|creativ|innova|singular/.test(n)) return [`Cuenta qué hace única tu mirada en una o dos frases propias.${echo}`];
  if (/presupuest|document|bases|ajuste/.test(n)) return ["Completa los huecos marcados con [Completa: …] y adjunta los certificados de Hacienda y Seguridad Social."];
  return [`Desarrolla «${criterion.name}» con un ejemplo concreto de tu experiencia.`];
}
