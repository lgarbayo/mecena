// Owned by WP-08. Pure helpers of the draft page: closed editions and the plain-text export for the sede electrónica.
import type { Application, Call } from "@/contracts";

const euros = (n: number) => `${n.toLocaleString("es-ES", { useGrouping: "always" })} €`;

/** A closed or past edition: the draft is for the next one. */
export function closedEdition(call: Pick<Call, "status" | "deadline">, now = new Date()): { year: number; next: number } | null {
  if (call.status !== "closed" && call.status !== "recurring") return null;
  const year = call.deadline ? Number(call.deadline.slice(0, 4)) || now.getFullYear() : now.getFullYear();
  return { year, next: Math.max(year + 1, now.getFullYear()) };
}

/** Plain-text version of the draft to paste into the sede electrónica (sections, budget, documents). */
export function draftAsText(call: Pick<Call, "title" | "organizer" | "amountText">, app: Pick<Application, "sections" | "budget" | "checklist">): string {
  const lines = [call.title, `${call.organizer} · ${call.amountText}`, ""];
  for (const sec of app.sections) lines.push(sec.title.toUpperCase(), "", sec.body.trim(), "");
  if (app.budget.length) {
    lines.push("PRESUPUESTO", "");
    for (const l of app.budget) lines.push(`- ${l.concept} (${l.expenseType}): ${euros(l.amountEur)}`);
    lines.push(`Total: ${euros(app.budget.reduce((sum, l) => sum + l.amountEur, 0))}`, "");
  }
  lines.push("DOCUMENTOS", "");
  for (const c of app.checklist) lines.push(`[${c.done ? "x" : " "}] ${c.item}`);
  lines.push("", "Preparado con Mecena. Revísalo y preséntalo tú con tu certificado digital o Cl@ve.");
  return lines.join("\n");
}
