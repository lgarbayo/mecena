/**
 * Scoring criteria: keep the bases' maxPoints and add integer weights that sum to exactly 100
 * (largest-remainder rounding), so a 60-point or 10-point scale compares with a 100-point one.
 */
import type { CallCriterion } from "@/contracts/domain";
import { type DataWarning, type NormalizedCriterion, warn } from "./types";

export interface CriteriaResult {
  criteria: NormalizedCriterion[];
  totalPoints: number;
  warnings: DataWarning[];
}

/** Integer percentages proportional to `values`, summing to 100 (Hamilton / largest remainder). */
export function largestRemainder(values: readonly number[], total = 100): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / sum) * total);
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left-- <= 0) break;
    floors[i]++;
  }
  return floors;
}

export function normalizeCriteria(criteria: readonly CallCriterion[], field = "criteria"): CriteriaResult {
  const warnings: DataWarning[] = [];
  if (!criteria.length) return { criteria: [], totalPoints: 0, warnings: [warn("criteria-empty", field, "La convocatoria no publica criterios de valoración", undefined, "info")] };
  criteria.forEach((c, i) => {
    if (!(c.maxPoints > 0)) warnings.push(warn("criteria-invalid", `${field}[${i}].maxPoints`, `El criterio «${c.name}» no tiene puntuación válida`, String(c.maxPoints), "error"));
  });
  const ids = criteria.map((c) => c.id);
  if (new Set(ids).size !== ids.length) warnings.push(warn("criteria-invalid", field, "Hay criterios con el mismo id", ids.join(","), "error"));
  const points = criteria.map((c) => (c.maxPoints > 0 ? c.maxPoints : 0));
  const totalPoints = Math.round(points.reduce((a, b) => a + b, 0) * 100) / 100;
  if (totalPoints !== 100)
    warnings.push(warn("criteria-sum", field, `Los criterios suman ${totalPoints} puntos, no 100: se reescalan a porcentaje`, String(totalPoints), "warning"));
  const weights = largestRemainder(points);
  return {
    criteria: criteria.map((c, i) => ({ id: c.id, name: c.name, description: c.description, maxPoints: c.maxPoints, weightPct: weights[i] })),
    totalPoints,
    warnings,
  };
}
