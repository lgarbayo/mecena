// Client-safe helpers (no taxonomy imports): fit label and calendar days left.
import type { Call } from "@/contracts";

export type FitLabel = "alto" | "medio" | "bajo";
export function fitLabel(score: number): FitLabel {
  return score >= 75 ? "alto" : score >= 60 ? "medio" : "bajo";
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
