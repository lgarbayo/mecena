// Client-safe helpers (no taxonomy imports): fit label and calendar days left.
import type { Call } from "@/contracts";

/** Maximum of each score part (rules.ts adds them up; the call detail draws its bars from them). Sums to 100. */
export const SCORE_MAX = { base: 25, affinity: 43, documents: 10, amount: 10, timing: 12 } as const;

export type FitLabel = "alto" | "medio" | "bajo";
/**
 * Thresholds measured on data/calls/calls.json with the 25-base scale: own discipline/sector plus some of the profile's
 * own words → alto; general aid for its kind or a related discipline → medio; other disciplines → bajo.
 */
export function fitLabel(score: number): FitLabel {
  return score >= 70 ? "alto" : score >= 55 ? "medio" : "bajo";
}

/** Calendar days from today (Spain) to the deadline: 0 = closes today, -1 = closed yesterday. */
export function daysUntil(deadlineIso: string, now: Date): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now); // YYYY-MM-DD
  return Math.round((Date.parse(deadlineIso) - Date.parse(today)) / 864e5);
}

/** Calendar days left until the deadline; undefined when there is no date. */
export function daysLeft(c: Pick<Call, "deadline">, now: Date = new Date()): number | undefined {
  return c.deadline ? daysUntil(c.deadline, now) : undefined;
}
