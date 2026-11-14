/**
 * Justification AI (IDEA #7): read an invoice photo, and write the narrative of the final memoria.
 * Trust rules: the model reads what is printed on the invoice and nothing else (no guessing a NIF, number or date that
 * is not legible); it never decides amounts, alerts or assignments (rules.ts does, from the numbers); and the memoria
 * narrative only uses facts from the application, the user's own words and the figures we hand it, with
 * "[Completa: …]" gaps for everything else. Mock (no key): deterministic, reads only the user's own hint.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { InvoiceExtraction, JustificationNarrative, type AiSlice, type ExtractInvoiceInput, type WriteJustificationInput } from "@/contracts";
import { imageBlock, structured } from "@/server/ai/llm";
import { polishProse, WORDING_RULE } from "@/server/ai/wording";
import { cleanDate, euros, fold, round2, suggestLine } from "./rules";

export const EXTRACT_INVOICE_SYSTEM = [
  "Lees la foto de una factura o ticket de un gasto de una subvención y devuelves sus datos tal como están impresos.",
  "",
  "Reglas:",
  "- Copia solo lo que se lee con claridad. Emisor, NIF/CIF del emisor, número de factura, fecha, concepto e importes: si algo no se lee o no aparece, devuélvelo vacío (cadena vacía o null). Nunca lo deduzcas ni lo inventes.",
  "- date en formato AAAA-MM-DD (las facturas españolas usan día/mes/año: 03/04/2026 es el 3 de abril).",
  "- Importes en euros como número (84.5, no \"84,50 €\"). baseEur = base imponible, vatEur = cuota de IVA, totalEur = total a pagar. Si solo ves el total, deja base e IVA en null.",
  "- concept: qué se compró, en pocas palabras y en español.",
  "- expenseType: SOLO uno de los tipos de gasto admitidos que te paso, el que mejor describa la compra; si ninguno encaja, cadena vacía.",
  "- lineConcept: SOLO una de las partidas del presupuesto que te paso (texto idéntico), la que mejor corresponda a la compra; si dudas, cadena vacía.",
  "- confidence: de 0 a 1, tu seguridad global en la lectura (baja si la foto está borrosa, cortada o es un ticket sin datos fiscales).",
  "- isInvoice: false si la foto no es una factura, ticket o justificante de pago.",
  "- Si el usuario añade una nota, úsala solo para decidir expenseType y lineConcept; nunca para rellenar datos que no se lean en la foto.",
].join("\n");

const ModelInvoice = z.object({
  isInvoice: z.boolean(),
  supplier: z.string(),
  taxId: z.string(),
  number: z.string(),
  date: z.string(),
  concept: z.string(),
  baseEur: z.number().nullable(),
  vatEur: z.number().nullable(),
  totalEur: z.number().nullable(),
  expenseType: z.string(),
  lineConcept: z.string(),
  confidence: z.number(),
});

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const amount = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? round2(n) : undefined);
const text = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);

/** The model's reading, held to the budget and the call: a type or line it made up is dropped, dates must be real. */
export function normalizeExtraction(m: z.infer<typeof ModelInvoice>, input: Pick<ExtractInvoiceInput, "budget" | "allowedExpenses">): InvoiceExtraction {
  if (!m.isInvoice) return nothingRead();
  const expenseType = input.allowedExpenses.find((a) => fold(a) === fold(m.expenseType));
  const line = suggestLine(input.budget, { lineConcept: m.lineConcept, expenseType, concept: m.concept, supplier: m.supplier });
  return InvoiceExtraction.parse({
    supplier: m.supplier.trim(),
    taxId: text(m.taxId),
    number: text(m.number),
    date: cleanDate(m.date.trim()),
    concept: m.concept.trim(),
    baseEur: amount(m.baseEur),
    vatEur: amount(m.vatEur),
    totalEur: amount(m.totalEur) ?? 0,
    expenseType: expenseType ?? line?.expenseType,
    lineConcept: line?.concept,
    confidence: clamp01(m.confidence),
  });
}

/** Nothing could be read: the user types the data. */
export function nothingRead(): InvoiceExtraction {
  return { supplier: "", concept: "", totalEur: 0, confidence: 0, fallback: true };
}

/** First "84,50 €" / "84.5 eur" / "1.200,00 euros" in a note, as a number. */
export function amountIn(note: string): number | undefined {
  const m = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|eur)/i.exec(note);
  if (!m) return undefined;
  const n = Number(m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(m[1]) ? m[1].replace(/\./g, "") : m[1]);
  return Number.isFinite(n) ? round2(n) : undefined;
}

/**
 * No key, no reading: the mock cannot see the photo. It takes what the user wrote about it ("Papelería Sol, papel de
 * acuarela, 84,50 €") and otherwise picks a budget line and an amount from the image bytes (stable for the same photo).
 * It never makes up a NIF, number or date: those stay empty and the alerts ask for them.
 */
function mockExtract({ imageBase64, budget, allowedExpenses, hint }: ExtractInvoiceInput): InvoiceExtraction {
  const note = hint?.trim() ?? "";
  const h = createHash("sha256").update(imageBase64).digest();
  const fromNote = note ? suggestLine(budget, { concept: note }) : undefined;
  const line = fromNote ?? (budget.length ? budget[h[0] % budget.length] : undefined);
  const supplierPart = note.includes(",") ? note.split(",")[0].trim() : "";
  const noteConcept = polishProse(
    note
      .slice(supplierPart ? note.indexOf(",") + 1 : 0)
      .replace(/(\d[\d.,]*)\s*(?:€|eur\w*)/gi, "")
      .replace(/[ ,]+$/, "")
      .trim(),
  );
  const total = amountIn(note) ?? (line ? round2(Math.max(10, line.amountEur * (0.2 + (h[1] % 5) * 0.1))) : 50);
  const expenseType = line && allowedExpenses.some((a) => fold(a) === fold(line.expenseType)) ? line.expenseType : undefined;
  return InvoiceExtraction.parse({
    supplier: supplierPart || "Proveedor (lectura simulada)",
    concept: noteConcept || (line?.concept ?? ""),
    totalEur: total,
    expenseType,
    lineConcept: line?.concept,
    confidence: 0.5,
  });
}

const SYSTEM_MEMORIA = [
  "Redactas partes de la memoria final de justificación de una subvención, para que la persona beneficiaria la revise y la presente ella misma.",
  "",
  "Reglas:",
  "- Escribe en primera persona, en español de España, con las palabras y los hechos de la persona: su solicitud, sus palabras, las notas que te dé y las cifras que te paso. Nada más.",
  "- No inventes actividades, fechas, resultados, cifras, públicos ni lugares. Todo dato que falte y que la memoria necesite va como hueco «[Completa: qué falta]».",
  "- No escribas tablas, importes por partida ni la relación de facturas: eso lo añade Mecena aparte con sus cifras.",
  "- Devuelve estas secciones y solo estas: «actividad» (Actividad realizada: qué se hizo, cuándo y dónde), «resultados» (Cumplimiento de objetivos y resultados), y «desviaciones» (Desviaciones respecto al presupuesto y su motivo) únicamente si te paso partidas con desviación.",
  "- body: párrafos separados por línea en blanco; sin markdown salvo guiones «- » para listas.",
  WORDING_RULE,
].join("\n");

const sentence = (t: string) => {
  const s = t.trim().replace(/\s+/g, " ");
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?…»)]$/.test(s) ? "" : "."}` : "";
};
const firstParagraph = (s: string | undefined) => (s ?? "").split(/\n\s*\n/)[0]?.trim() ?? "";

/** Lines whose spending went over the budget (the only ones that need a reason). */
export const overLines = (lines: WriteJustificationInput["lines"]) => lines.filter((l) => l.spentEur - l.budgetEur > 0.005);

function mockWrite({ application, notes, lines }: WriteJustificationInput): JustificationNarrative {
  const memoria = firstParagraph(application.sections.find((s) => s.key === "memoria")?.body);
  const objetivos = firstParagraph(application.sections.find((s) => s.key === "objetivos")?.body);
  const said = notes?.trim() ? sentence(polishProse(notes)) : "";
  const sections = [
    {
      key: "actividad",
      title: "Actividad realizada",
      body: [said || "[Completa: qué has hecho, cuándo y dónde]", memoria ? `En la solicitud presenté el proyecto así: ${memoria}` : ""].filter(Boolean).join("\n\n"),
    },
    {
      key: "resultados",
      title: "Cumplimiento de objetivos y resultados",
      body: [objetivos ? `Objetivos que me marqué: ${objetivos}` : "", "[Completa: resultados alcanzados y cómo puedes demostrarlos (fotos, enlaces, asistentes…)]"].filter(Boolean).join("\n\n"),
    },
  ];
  const over = overLines(lines);
  if (over.length)
    sections.push({
      key: "desviaciones",
      title: "Desviaciones respecto al presupuesto",
      body: over.map((l) => `- «${l.concept}»: presupuestados ${euros(l.budgetEur)} y gastados ${euros(l.spentEur)}. [Completa: motivo de la diferencia]`).join("\n"),
    });
  return { sections };
}

export const justificationAi: AiSlice<"extractInvoice" | "writeJustification"> = {
  mock: {
    extractInvoice: async (input) => mockExtract(input),
    writeJustification: async (input) => mockWrite(input),
  },
  real: {
    async extractInvoice(input) {
      try {
        const out = await structured({
          tier: "fast",
          system: EXTRACT_INVOICE_SYSTEM,
          user: [
            imageBlock(input.imageBase64, input.mediaType),
            {
              type: "text",
              text: JSON.stringify({
                tiposDeGastoAdmitidos: input.allowedExpenses,
                partidasDelPresupuesto: input.budget.map((l) => ({ concept: l.concept, expenseType: l.expenseType })),
                notaDelUsuario: input.hint?.trim() || undefined,
              }),
            },
          ],
          schema: ModelInvoice,
          maxTokens: 1500,
        });
        return normalizeExtraction(out, input);
      } catch (e) {
        // AiError or anything unexpected: the user types the invoice by hand (the photo is kept).
        console.warn("[justification] extractInvoice fell back to manual entry:", e instanceof Error ? e.message : e);
        return nothingRead();
      }
    },
    async writeJustification(input) {
      const { profile, call, application, transcript, lines, notes } = input;
      const out = await structured({
        tier: "smart",
        system: SYSTEM_MEMORIA,
        schema: JustificationNarrative,
        user: JSON.stringify({
          tipo: profile.kind === "creator" ? "creador/a" : "pyme/autónomo",
          nombre: profile.displayName,
          convocatoria: { titulo: call.title, organizador: call.organizer },
          solicitud: application.sections.map((s) => ({ seccion: s.title, texto: s.body })),
          palabrasDeLaPersona: transcript.map((t) => t.text),
          notasSobreLoEjecutado: notes?.trim() || undefined,
          partidas: lines.map((l) => ({ ...l, desviacion: l.spentEur - l.budgetEur > 0.005 })),
        }),
        effort: "medium",
        maxTokens: 6000,
      });
      const keep = new Set(["actividad", "resultados", ...(overLines(lines).length ? ["desviaciones"] : [])]);
      return { sections: out.sections.filter((s) => keep.has(s.key) && s.body.trim()) };
    },
  },
};
