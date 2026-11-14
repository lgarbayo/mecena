// Deterministic guards applied to every draft (mock or Claude): the bases decide what is allowed.
import type { ApplicationDraftContent, BudgetLine, Call, ChecklistItem, TranscriptSegment } from "@/contracts";

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

/** Prizes, contests and open calls pay a fixed award: they ask for no budget. */
export const needsBudget = (call: Pick<Call, "type" | "allowedExpenses">) => call.allowedExpenses.length > 0 || !["premio", "certamen", "convocatoria"].includes(call.type);

const euros = (n: number) => `${n.toLocaleString("es-ES", { useGrouping: "always" })} €`;

/**
 * Check the user's own budget edits without changing them (they have the last word): returns the lines as written
 * (expense types only normalised to the bases' spelling) or a Spanish error to show. Zero-amount lines are kept
 * (the user may be typing); nothing is dropped or rescaled behind their back.
 */
export function validateBudget(lines: readonly BudgetLine[], call: Call): { budget: BudgetLine[] } | { error: string } {
  const allowed = call.allowedExpenses;
  const budget: BudgetLine[] = [];
  for (const l of lines) {
    if (!Number.isFinite(l.amountEur) || l.amountEur < 0) return { error: `El importe de «${l.concept || "la partida"}» no es válido.` };
    const expenseType = matchExpense(l.expenseType, allowed);
    if (!expenseType) return { error: `«${l.expenseType}» no es un gasto admitido por las bases. Elige uno de: ${allowed.join(", ")}.` };
    budget.push({ ...l, expenseType });
  }
  const cap = call.amountEur.max;
  const total = budget.reduce((sum, l) => sum + l.amountEur, 0);
  if (cap && total > cap) return { error: `El total (${euros(total)}) supera el máximo de ${euros(cap)}. Ajusta las partidas para guardar.` };
  return { budget };
}

export const CERTIFICATES = ["Certificado de estar al corriente con Hacienda", "Certificado de estar al corriente con la Seguridad Social"];

/**
 * Every required document of the call, plus the Hacienda / Seguridad Social certificates for public calls (private
 * contests only get them when their bases ask for them); keeps ticks the user already made.
 */
export function buildChecklist(call: Call, previous: readonly ChecklistItem[] = []): ChecklistItem[] {
  const done = new Map(previous.map((c) => [fold(c.item), c.done]));
  const items = [...call.requiredDocuments];
  const mentions = (re: RegExp) => items.some((d) => re.test(fold(d)));
  if (call.scope !== "privado") {
    if (!mentions(/hacienda|tribut|aeat|atriga/)) items.push(CERTIFICATES[0]);
    if (!mentions(/seguridad social/)) items.push(CERTIFICATES[1]);
  }
  return items.map((item) => ({
    item,
    done: done.get(fold(item)) ?? false,
    ...(/certificad|hacienda|seguridad social/.test(fold(item)) ? { hint: "Lo descargas con tu certificado digital o Cl@ve" } : {}),
  }));
}

const words = (s: string) => fold(s).replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/).filter(Boolean);
const STOP = new Set("de la el en y a que los las un una con por para mi me se lo su al del es soy como mas pero o".split(" "));

/** Transcript segments a text visibly quotes or closely paraphrases (shares a run of 4 words, or 5+ content words). */
export function quotedSegments(text: string, transcript: readonly TranscriptSegment[]): string[] {
  const body = words(text);
  const grams = new Set(body.map((_, i) => body.slice(i, i + 4).join(" ")).filter((g) => g.split(" ").length === 4));
  const bodyContent = new Set(body.filter((w) => w.length > 3 && !STOP.has(w)));
  return transcript
    .filter((seg) => {
      const w = words(seg.text);
      if (w.some((_, i) => i + 4 <= w.length && grams.has(w.slice(i, i + 4).join(" ")))) return true;
      const content = [...new Set(w.filter((x) => x.length > 3 && !STOP.has(x)))];
      return content.length >= 5 && content.filter((x) => bodyContent.has(x)).length >= 5;
    })
    .map((seg) => seg.id);
}

/**
 * Apply the guards to whatever the model returned. Section source ids are restricted to real transcript segments;
 * a section that quotes the transcript but lists no ids gets them from the quotes, so "Escrito con tus palabras" holds.
 */
export function enforce(content: ApplicationDraftContent, call: Call, transcript: readonly TranscriptSegment[]): ApplicationDraftContent {
  const ids = new Set(transcript.map((t) => t.id));
  const noBudget = !needsBudget(call);
  return {
    sections: content.sections.map((s) => {
      const valid = s.sourceSegmentIds.filter((id) => ids.has(id));
      return { ...s, sourceSegmentIds: valid.length ? valid : quotedSegments(s.body, transcript) };
    }),
    budget: noBudget ? [] : fitBudget(content.budget, call),
    checklist: buildChecklist(call, content.checklist),
  };
}

/** "[Completa: …]" markers left for the user. */
export const GAP_RE = /\[Completa:[^\]]*\]/g;
