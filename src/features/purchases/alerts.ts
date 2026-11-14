// Owned by WP-07. Pro "avisos de cierre": the matches that close within a week, shown in the app (no e-mail/push).
import type { Call } from "@/contracts";
import { daysLeft } from "@/features/matching/labels";

export const ALERT_DAYS = 7;

export interface ClosingSoon {
  call: Pick<Call, "id" | "title">;
  days: number;
}

/**
 * Open calls with a published (not estimated) deadline within ALERT_DAYS, soonest first.
 * Estimated deadlines are left out: "cierra en 3 días" must be a fact.
 */
export function closingSoon(results: { call: Call }[], now: Date = new Date(), max = 3): ClosingSoon[] {
  return results
    .filter(({ call }) => call.status === "open" && !/^estimado/i.test(call.deadlineText))
    .map(({ call }) => ({ call, days: daysLeft(call, now) }))
    .filter((r): r is { call: Call; days: number } => r.days !== undefined && r.days >= 0 && r.days <= ALERT_DAYS)
    .sort((a, b) => a.days - b.days)
    .slice(0, max)
    .map(({ call, days }) => ({ call: { id: call.id, title: call.title }, days }));
}

/** "Cierra hoy" · "Cierra mañana" · "Cierra en 5 días". */
export function closesIn(days: number): string {
  return days === 0 ? "Cierra hoy" : days === 1 ? "Cierra mañana" : `Cierra en ${days} días`;
}
