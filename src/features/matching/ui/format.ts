// Display helpers for calls (Spanish from Spain). Pure: safe in server and client components.
import type { Call } from "@/contracts";

const DATE = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function formatDate(iso: string): string {
  return DATE.format(new Date(`${iso}T00:00:00Z`));
}

/** Year of a recurring call's last (closed) edition: the id's trailing year, else its verification year. */
export function editionYear(call: Pick<Call, "id" | "verifiedAt">): number {
  const m = /-(20\d\d)$/.exec(call.id);
  return m ? +m[1] : +call.verifiedAt.slice(0, 4);
}

/** "La edición 2026 ya cerró; la próxima, previsiblemente en 2027" for an annual call whose edition has closed. */
export function nextEditionLabel(call: Pick<Call, "id" | "verifiedAt">): string {
  const y = editionYear(call);
  return `La edición ${y} ya cerró; la próxima, previsiblemente en ${y + 1}`;
}

/** "Cierra hoy" · "Quedan 3 días" · "Abre el 29 de marzo de 2027" · "La edición 2026 ya cerró…". */
export function deadlineLabel(call: Pick<Call, "id" | "verifiedAt" | "deadline" | "status" | "opensAt" | "deadlineText">, days: number | undefined): string {
  if (call.status === "recurring") return nextEditionLabel(call);
  if (call.status === "upcoming" && call.opensAt) return `Abre el ${formatDate(call.opensAt)}`;
  if (days === undefined) return call.deadlineText || "Plazo: consultar bases";
  const estimated = /estimad/i.test(call.deadlineText) ? " (estimado)" : "";
  if (days === 0) return `Cierra hoy${estimated}`;
  if (days === 1) return `Cierra mañana${estimated}`;
  return `Quedan ${days} días${estimated}`;
}

export function isUrgent(days: number | undefined): boolean {
  return days !== undefined && days <= 7;
}

export const FIT_COPY = { alto: "Encaje alto", medio: "Encaje medio", bajo: "Encaje bajo" } as const;
