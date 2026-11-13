// Display helpers for calls (Spanish from Spain). Pure: safe in server and client components.
import type { Call } from "@/contracts";

const DATE = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function formatDate(iso: string): string {
  return DATE.format(new Date(`${iso}T00:00:00Z`));
}

/** "Cierra hoy" · "Quedan 3 días" · "Abre el 29 de marzo de 2027" · "Se convoca cada año". */
export function deadlineLabel(call: Pick<Call, "deadline" | "status" | "opensAt" | "deadlineText">, days: number | undefined): string {
  if (call.status === "recurring") return "Se convoca cada año";
  if (call.status === "upcoming" && call.opensAt) return `Abre el ${formatDate(call.opensAt)}`;
  if (days === undefined) return call.deadlineText || "Plazo: consultar bases";
  const estimated = /^estimado/i.test(call.deadlineText) ? " (estimado)" : "";
  if (days === 0) return `Cierra hoy${estimated}`;
  if (days === 1) return `Cierra mañana${estimated}`;
  return `Quedan ${days} días${estimated}`;
}

export function isUrgent(days: number | undefined): boolean {
  return days !== undefined && days <= 7;
}

export const FIT_COPY = { alto: "Encaje alto", medio: "Encaje medio", bajo: "Encaje bajo" } as const;
