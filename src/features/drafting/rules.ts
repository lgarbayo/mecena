// Deterministic guards applied to every draft (mock or Claude): the bases decide what is allowed.
import type { ApplicationDraftContent, BudgetLine, Call, ChecklistItem } from "@/contracts";

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Map a free expense type onto one of the call's allowed expenses ("" when none fits). */
export function matchExpense(type: string, allowed: readonly string[]): string {
  if (!allowed.length) return type;
  const t = fold(type);
  return allowed.find((a) => fold(a) === t) ?? allowed.find((a) => fold(a).includes(t) || t.includes(fold(a))) ?? "";
}

/** Keep only lines allowed by the bases and scale them down (to whole euros) so the total fits amountEur.max. */
export function fitBudget(lines: readonly BudgetLine[], call: Call): BudgetLine[] {
  const allowed = call.allowedExpenses;
  const kept = lines
    .map((l) => ({ ...l, expenseType: matchExpense(l.expenseType, allowed), amountEur: Math.max(0, Math.round(l.amountEur)) }))
    .filter((l) => l.expenseType && l.amountEur > 0);
  const cap = call.amountEur.max;
  const total = kept.reduce((s, l) => s + l.amountEur, 0);
  if (!cap || total <= cap) return kept;
  const k = cap / total;
  const scaled = kept.map((l) => ({ ...l, amountEur: Math.floor(l.amountEur * k) }));
  return scaled.map((l, i) => (i === 0 ? { ...l, amountEur: l.amountEur + (cap - scaled.reduce((s, x) => s + x.amountEur, 0)) } : l));
}

export const CERTIFICATES = ["Certificado de estar al corriente con Hacienda", "Certificado de estar al corriente con la Seguridad Social"];

/** Every required document of the call, plus the Hacienda / Seguridad Social certificates; keeps ticks the user already made. */
export function buildChecklist(call: Call, previous: readonly ChecklistItem[] = []): ChecklistItem[] {
  const done = new Map(previous.map((c) => [fold(c.item), c.done]));
  const items = [...call.requiredDocuments];
  const mentions = (re: RegExp) => items.some((d) => re.test(fold(d)));
  if (!mentions(/hacienda|tribut|aeat|atriga/)) items.push(CERTIFICATES[0]);
  if (!mentions(/seguridad social/)) items.push(CERTIFICATES[1]);
  return items.map((item) => ({
    item,
    done: done.get(fold(item)) ?? false,
    ...(/certificad|hacienda|seguridad social/.test(fold(item)) ? { hint: "Lo descargas con tu certificado digital o Cl@ve" } : {}),
  }));
}

/** Apply the guards to whatever the model returned. Section source ids are restricted to real transcript segments. */
export function enforce(content: ApplicationDraftContent, call: Call, segmentIds: readonly string[]): ApplicationDraftContent {
  const ids = new Set(segmentIds);
  const noBudget = call.allowedExpenses.length === 0 && ["premio", "certamen", "convocatoria"].includes(call.type);
  return {
    sections: content.sections.map((s) => ({ ...s, sourceSegmentIds: s.sourceSegmentIds.filter((id) => ids.has(id)) })),
    budget: noBudget ? [] : fitBudget(content.budget, call),
    checklist: buildChecklist(call, content.checklist),
  };
}

/** "[Completa: …]" markers left for the user. */
export const GAP_RE = /\[Completa:[^\]]*\]/g;
