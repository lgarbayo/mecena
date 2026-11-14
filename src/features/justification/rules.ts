/**
 * Justification rules (IDEA #7), all deterministic: which budget line an invoice counts against, how much each line has
 * spent, and the deviation alerts. The model only reads the photo and writes prose; every number and every alert comes
 * from here, so the user can trust (and check) them.
 *
 * Wording is deliberately cautious: each call's bases set their own deviation margins and eligible dates, which we do
 * not have as data, so alerts say what the numbers show and send the user to their bases for the rule.
 */
import { createHash } from "node:crypto";
import type { BudgetLine, Call, Invoice } from "@/contracts";
import type { JustificationAlert, JustificationLine, JustificationSummary } from "@/contracts/api";

/** Overspending a line by more than this is a "danger"; below it, a "warn" (many bases allow small shifts between lines). */
export const LINE_MARGIN = 0.1;
/** Below this confidence the invoice is flagged for a second look. */
export const LOW_CONFIDENCE = 0.6;

import { euros, round2 } from "./format";
export { euros, round2 };
const pct = (n: number) => `${Math.round(n * 100)} %`;

export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** The budget line an invoice's `lineConcept` names (accent/case-insensitive), if it still exists. */
export function findLine(budget: readonly BudgetLine[], concept: string | undefined): BudgetLine | undefined {
  if (!concept) return undefined;
  const f = fold(concept);
  return budget.find((l) => fold(l.concept) === f);
}

const words = (s: string) => new Set(fold(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3));

/**
 * Where an invoice most likely belongs: the line the reader suggested if it is one of the budget's, else the line with
 * the same expense type, else the one whose concept shares the most words with the invoice. undefined = ask the user.
 */
export function suggestLine(budget: readonly BudgetLine[], hint: { lineConcept?: string; expenseType?: string; concept?: string; supplier?: string }): BudgetLine | undefined {
  const named = findLine(budget, hint.lineConcept);
  if (named) return named;
  if (hint.expenseType) {
    const same = budget.filter((l) => fold(l.expenseType) === fold(hint.expenseType!));
    if (same.length === 1) return same[0];
    if (same.length > 1) return bestByWords(same, hint) ?? same[0];
  }
  return bestByWords(budget, hint);
}

function bestByWords(lines: readonly BudgetLine[], hint: { concept?: string; supplier?: string }): BudgetLine | undefined {
  const mine = words(`${hint.concept ?? ""} ${hint.supplier ?? ""}`);
  let best: { line: BudgetLine; score: number } | undefined;
  for (const line of lines) {
    const theirs = words(`${line.concept} ${line.expenseType}`);
    const score = [...mine].filter((w) => theirs.has(w) || [...theirs].some((t) => t.slice(0, 5) === w.slice(0, 5))).length;
    if (score > 0 && (!best || score > best.score)) best = { line, score };
  }
  return best?.line;
}

/** Same issuer, number and total: the same invoice photographed twice. */
const dupKey = (i: Invoice) => (i.number && i.totalEur ? `${fold(i.supplier || i.taxId || "")}|${fold(i.number)}|${round2(i.totalEur)}` : "");

/** Fingerprint of what the final memoria is built from; a different one means the memoria is out of date. */
export function signatureOf(budget: readonly BudgetLine[], invoices: readonly Invoice[]): string {
  const data = {
    b: budget.map((l) => [l.concept, l.amountEur]),
    i: [...invoices]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((i) => [i.id, i.supplier, i.number, i.date, i.concept, round2(i.totalEur), i.lineConcept ?? ""]),
  };
  return createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16);
}

export function summarize(budget: readonly BudgetLine[], invoices: readonly Invoice[], call: Pick<Call, "allowedExpenses">): JustificationSummary {
  const alerts: JustificationAlert[] = [];
  const spent = new Map<string, { eur: number; n: number }>();
  let unassignedEur = 0;

  for (const inv of invoices) {
    const line = findLine(budget, inv.lineConcept);
    if (line) {
      const cur = spent.get(line.concept) ?? { eur: 0, n: 0 };
      spent.set(line.concept, { eur: cur.eur + inv.totalEur, n: cur.n + 1 });
    } else {
      unassignedEur += inv.totalEur;
      alerts.push({
        id: `unassigned:${inv.id}`,
        kind: "unassigned",
        severity: "warn",
        message: `${label(inv)} no está asignada a ninguna partida del presupuesto: elige a cuál corresponde para que cuente.`,
        invoiceId: inv.id,
      });
    }
  }

  const lines: JustificationLine[] = budget.map((l) => {
    const s = spent.get(l.concept) ?? { eur: 0, n: 0 };
    return {
      concept: l.concept,
      expenseType: l.expenseType,
      budgetEur: round2(l.amountEur),
      spentEur: round2(s.eur),
      remainingEur: round2(l.amountEur - s.eur),
      pct: l.amountEur > 0 ? s.eur / l.amountEur : s.eur > 0 ? Infinity : 0,
      invoiceCount: s.n,
    };
  });
  // JSON has no Infinity: a line with no budget and some spend is capped at a large, finite ratio.
  for (const l of lines) if (!Number.isFinite(l.pct)) l.pct = 99;

  const budgetEur = round2(budget.reduce((n, l) => n + l.amountEur, 0));
  const spentEur = round2(lines.reduce((n, l) => n + l.spentEur, 0));

  for (const l of lines) {
    const over = l.spentEur - l.budgetEur;
    if (over > 0.005) {
      const ratio = l.budgetEur > 0 ? over / l.budgetEur : 1;
      const danger = ratio > LINE_MARGIN;
      alerts.push({
        id: `line_over:${l.concept}`,
        kind: "line_over",
        severity: danger ? "danger" : "warn",
        lineConcept: l.concept,
        message: danger
          ? `«${l.concept}» se pasa ${euros(over)} (${pct(l.pct)} de lo presupuestado). Comprueba en las bases si permiten esta desviación; si no, esa parte puede no ser justificable.`
          : `«${l.concept}» se pasa ${euros(over)} (${pct(l.pct)} de lo presupuestado). Muchas bases admiten pequeñas desviaciones entre partidas: confírmalo en las tuyas.`,
      });
    }
  }
  if (spentEur - budgetEur > 0.005)
    alerts.push({
      id: "total_over",
      kind: "total_over",
      severity: "info",
      message: `Has asignado ${euros(spentEur)} frente a ${euros(budgetEur)} presupuestados. La ayuda no crece por gastar más: solo se justifica hasta el importe concedido.`,
    });
  if (invoices.length && budgetEur - spentEur > 0.005)
    alerts.push({
      id: "unjustified",
      kind: "unjustified",
      severity: "info",
      message: `Te quedan ${euros(budgetEur - spentEur)} por justificar (${pct(budgetEur ? spentEur / budgetEur : 0)} del presupuesto). Si justificas menos de lo concedido, la administración puede reducir la ayuda o pedirte la devolución de la diferencia.`,
    });

  const seen = new Map<string, Invoice>();
  for (const inv of invoices) {
    const allowed = call.allowedExpenses;
    if (inv.expenseType && allowed.length && !allowed.some((a) => fold(a) === fold(inv.expenseType!)))
      alerts.push({
        id: `expense_not_allowed:${inv.id}`,
        kind: "expense_not_allowed",
        severity: "danger",
        invoiceId: inv.id,
        message: `${label(inv)} es de tipo «${inv.expenseType}», que las bases no recogen entre los gastos subvencionables (${allowed.join(", ")}).`,
      });

    const k = dupKey(inv);
    if (k) {
      const first = seen.get(k);
      if (first)
        alerts.push({
          id: `duplicate:${inv.id}`,
          kind: "duplicate",
          severity: "danger",
          invoiceId: inv.id,
          message: `${label(inv)} parece la misma que otra ya añadida (mismo emisor, número e importe). Elimina una: una factura repetida no se puede justificar dos veces.`,
        });
      else seen.set(k, inv);
    }

    const missing = [!inv.supplier.trim() && "emisor", !inv.taxId && "NIF del emisor", !inv.number && "número", !inv.date && "fecha", !(inv.totalEur > 0) && "importe"].filter(Boolean) as string[];
    if (missing.length)
      alerts.push({
        id: `missing_data:${inv.id}`,
        kind: "missing_data",
        severity: "warn",
        invoiceId: inv.id,
        message: `A ${label(inv)} le falta: ${missing.join(", ")}. Complétalo a mano mirando la factura; sin esos datos no suele valer como justificante.`,
      });

    if (inv.baseEur !== undefined && inv.vatEur !== undefined && inv.totalEur > 0 && Math.abs(inv.baseEur + inv.vatEur - inv.totalEur) > 0.05)
      alerts.push({
        id: `amount_mismatch:${inv.id}`,
        kind: "amount_mismatch",
        severity: "warn",
        invoiceId: inv.id,
        message: `En ${label(inv)}, base (${euros(inv.baseEur)}) + IVA (${euros(inv.vatEur)}) no suman el total (${euros(inv.totalEur)}). Revisa los importes.`,
      });

    if (inv.extractedBy !== "manual" && inv.confidence < LOW_CONFIDENCE)
      alerts.push({
        id: `low_confidence:${inv.id}`,
        kind: "low_confidence",
        severity: "info",
        invoiceId: inv.id,
        message: `${label(inv)}: la lectura de la foto es poco segura. Compara los datos con la factura antes de darlos por buenos.`,
      });
  }

  const order = { danger: 0, warn: 1, info: 2 } as const;
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    lines,
    budgetEur,
    spentEur,
    unassignedEur: round2(unassignedEur),
    pct: budgetEur > 0 ? spentEur / budgetEur : 0,
    alerts,
    signature: signatureOf(budget, invoices),
  };
}

/** "La factura de Papelería Sol (84,50 €)": how an alert names an invoice. */
export function label(inv: Pick<Invoice, "supplier" | "number" | "totalEur">): string {
  const who = inv.supplier.trim() || (inv.number ? `nº ${inv.number}` : "una factura sin emisor");
  return `La factura de ${who}${inv.totalEur > 0 ? ` (${euros(inv.totalEur)})` : ""}`;
}

/** Valid YYYY-MM-DD (a real calendar day) or undefined. */
export function cleanDate(d: string | undefined | null): string | undefined {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return undefined;
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d ? undefined : d;
}

/** The deterministic economic section of the memoria (numbers from code, never from the model). */
export function economicSection(summary: JustificationSummary, invoices: readonly Invoice[]): string {
  const rows = summary.lines.map((l) => `- ${l.concept}: presupuestado ${euros(l.budgetEur)}, justificado ${euros(l.spentEur)} (${pct(l.pct)}) con ${l.invoiceCount} ${l.invoiceCount === 1 ? "factura" : "facturas"}.`);
  const list = [...invoices]
    .filter((i) => findLine(summary.lines.map((l) => ({ concept: l.concept, amountEur: l.budgetEur, expenseType: l.expenseType })), i.lineConcept))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .map((i) => `- ${i.date ?? "[Completa: fecha]"} · ${i.supplier || "[Completa: emisor]"}${i.taxId ? ` (${i.taxId})` : ""} · ${i.number ? `nº ${i.number}` : "[Completa: nº de factura]"} · ${i.concept || "—"} · ${euros(i.totalEur)} · partida «${i.lineConcept}».`);
  return [
    `Importe total justificado: ${euros(summary.spentEur)} de ${euros(summary.budgetEur)} presupuestados (${pct(summary.pct)}).`,
    "",
    "Por partidas:",
    ...rows,
    "",
    "Relación de facturas:",
    ...(list.length ? list : ["- [Completa: aún no hay facturas asignadas]"]),
    ...(summary.unassignedEur > 0 ? ["", `Hay ${euros(summary.unassignedEur)} en facturas sin asignar a ninguna partida; no se han contado.`] : []),
  ].join("\n");
}
