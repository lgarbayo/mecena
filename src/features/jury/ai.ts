// Owned by WP-08. Judges score the call's criteria; revise applies accepted fixes using only the user's facts.
// Mock: 61 for a fresh draft, rising to 84 with the fixes really applied (see ./rules.mockTarget). Real: Claude.
// Latency (the 61 → 84 beat is ~20 s on stage): the revision returns only the paragraphs it changes (a patch, not a
// rewrite) and the three judges run in parallel with a lower effort than drafting. Tunable without a deploy of code:
// MECENA_JURY_TIER (smart|fast), MECENA_JURY_EFFORT and MECENA_REVISE_EFFORT (low|medium|high).
import { z } from "zod";
import {
  JudgeVerdict,
  type AiSlice,
  type Application,
  type ApplicationDraftContent,
  type ApplicationSection,
  type Call,
  type ModelTier,
  type ReviseApplicationInput,
  type TranscriptSegment,
  type Work,
} from "@/contracts";
import { enforce } from "@/features/drafting/rules";
import { structured, type StructuredRequest } from "@/server/ai/llm";
import { polishProse, WORDING_RULE } from "@/server/ai/wording";
import { allocate, BUSINESS_JUDGES, CREATOR_JUDGES, fixesFor, isVisualCriterion, judgeSpread, mockTarget } from "./rules";

type Effort = NonNullable<StructuredRequest<z.ZodType>["effort"]>;
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];
const effortEnv = (name: string, fallback: Effort): Effort => (EFFORTS as readonly string[]).includes(process.env[name] ?? "") ? (process.env[name] as Effort) : fallback;
/** Judges: Opus at medium effort by default (MECENA_JURY_TIER=fast switches them to Sonnet). Revision: Opus, medium. */
export const juryModelConfig = () => ({
  judgeTier: (process.env.MECENA_JURY_TIER === "fast" ? "fast" : "smart") as ModelTier,
  judgeEffort: effortEnv("MECENA_JURY_EFFORT", "medium"),
  reviseEffort: effortEnv("MECENA_REVISE_EFFORT", "medium"),
});

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const COMMENT: Record<string, [string, string]> = {
  // [weak, strong]
  tecnica: ["Cumple lo básico, pero faltan datos que las bases piden.", "Se ajusta a las bases y está bien justificada."],
  comisaria: ["La idea tiene fuerza, aunque la memoria no la desarrolla del todo.", "Propuesta coherente y con voz propia."],
  gestor: ["No queda claro el calendario ni a quién llega el proyecto.", "Se entiende cómo se hará y a quién llega."],
  "tecnico-agencia": ["Faltan justificantes y concreción de los gastos.", "Gastos admitidos y bien justificados."],
  consultora: ["El plan es razonable pero sin cifras que lo sostengan.", "Plan viable y bien dimensionado."],
  "evaluador-impacto": ["El impacto no está cuantificado.", "Impacto claro y medible."],
};

const ALL_JUDGES = [...CREATOR_JUDGES, ...BUSINESS_JUDGES];

/** Deterministic verdict: the panel average hits mockTarget exactly; each judge deviates a little (offsets cancel out). */
function mockVerdict(call: Call, application: Application, judgeId: string) {
  const target = mockTarget(application, call);
  const avg = allocate(call.criteria, target);
  const judgeIndex = Math.max(0, ALL_JUDGES.findIndex((j) => j.id === judgeId)) % 3;
  const points = judgeSpread(call.criteria, avg, judgeIndex);
  const [weak, strong] = COMMENT[judgeId] ?? ["Mejorable.", "Bien resuelto."];
  return {
    judgeId,
    scores: call.criteria.map((c, i) => ({
      criterionId: c.id,
      points: points[i],
      comment: points[i] / c.maxPoints < 0.7 ? weak : strong,
      // the panel agrees on what is weak (by the average), so every judge proposes the same fixes
      fixes: avg[i] / c.maxPoints < 0.7 ? fixesFor(c, application) : [],
    })),
    overall: target >= 80 ? "La solicitud responde bien a los criterios." : "Buena base: con algunos datos concretos subiría mucho.",
  };
}

const euros = (n: number) => `${n.toLocaleString("es-ES", { useGrouping: "always" })} €`;
const sentence = (t: string) => {
  const s = t.trim().replace(/\s+/g, " ");
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?…»)]$/.test(s) ? "" : "."}` : "";
};
const GAP = /\[Completa:[^\]]*\]/;
const keywords = (s: string) => new Set(fold(s).split(/[^a-zñ]+/).filter((w) => w.length > 4));

/**
 * Mock revision: each accepted fix adds or changes text built only from facts already in the draft, the transcript,
 * the works' technical sheets, the budget or what the user typed for that fix. Never invents.
 */
export function mockRevise({ application, transcript, fixes, facts = [], works = [] }: Pick<ReviseApplicationInput, "application" | "transcript" | "fixes" | "facts" | "works">): ApplicationDraftContent {
  const sections: ApplicationSection[] = application.sections.map((s) => ({ ...s, sourceSegmentIds: [...s.sourceSegmentIds] }));
  const get = (key: string) => sections.find((s) => s.key === key) ?? sections.find((s) => s.key === "memoria") ?? sections[0];
  const add = (key: string, text: string, segIds: string[] = [], first = false) => {
    const s = get(key);
    if (!s || !text || s.body.includes(text)) return false;
    s.body = first ? `${text}\n\n${s.body}` : `${s.body}\n\n${text}`;
    s.sourceSegmentIds = [...new Set([...s.sourceSegmentIds, ...segIds])];
    return true;
  };
  /** Replace the "[Completa: …]" gap that matches the fix best with the user's own fact. */
  const fillGap = (fix: string, fact: string) => {
    const want = keywords(fix);
    let fallback: ApplicationSection | undefined;
    for (const s of sections) {
      for (const m of s.body.match(new RegExp(GAP.source, "g")) ?? []) {
        if ([...keywords(m)].some((w) => want.has(w) || [...want].some((x) => x.slice(0, 5) === w.slice(0, 5)))) {
          s.body = s.body.replace(m, fact.trim());
          return true;
        }
        fallback ??= s;
      }
    }
    if (/hueco/.test(fold(fix)) && fallback) {
      fallback.body = fallback.body.replace(GAP, fact.trim());
      return true;
    }
    return false;
  };
  const seg = (re: RegExp) => transcript.filter((t) => re.test(t.text));
  const quote = (segs: TranscriptSegment[]) => segs.map((t) => polishProse(t.text)).join(" ");

  for (const fix of fixes) {
    const f = fold(fix);
    const fact = facts.find((x) => x.fix === fix)?.text.trim();
    let usedFact = fact ? fillGap(fix, fact) : false;
    if (/calendario|fases/.test(f)) {
      if (fact && !usedFact) usedFact = add("memoria", `Calendario: ${fact.replace(/\.$/, "")}.`);
      add("memoria", "Fases: preparación, producción y cierre con presentación pública.");
    } else if (/partida|presupuesto/.test(f)) {
      if (application.budget.length) add("memoria", `Destino del presupuesto: ${application.budget.map((b) => `${b.concept.toLowerCase()} (${euros(b.amountEur)}, ${b.expenseType})`).join("; ")}.`);
    } else if (/trayectoria|logros/.test(f)) {
      const cv = sections.find((s) => s.key === "cv" || s.key === "company");
      const items = (cv?.body ?? "").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));
      if (items.length) add("memoria", `Mi trayectoria respalda el proyecto: ${items.join("; ")}.`);
    } else if (/territorio/.test(f)) {
      const place = transcript.filter((t) => /\b(de|en) [A-ZÁÉÍÓÚ]/.test(t.text) || /malpica|coruña|galicia|barrio|pueblo|ciudad/i.test(t.text));
      if (place.length) add("memoria", `Vínculo con el territorio: ${quote(place)}`, place.map((p) => p.id));
    } else if (/unica|mirada|propias/.test(f)) {
      const voice = seg(/porque|me interesa|me importa/i);
      const said = quote(voice);
      // the statement usually quotes it already: then the memoria says why the project exists, in the same words
      if (voice.length && !get("statement").body.includes(said)) add("statement", `Lo que hace distinta mi mirada: ${said}`, voice.map((v) => v.id));
      else if (voice.length) add("memoria", `Por qué lo hago: ${said}`, voice.map((v) => v.id));
    } else if (/formatos|tecnica con el proyecto|materiales/.test(f)) {
      const sheets = works.map((w) => w.sheet).filter((s) => s.title && (s.technique || s.dimensions));
      if (sheets.length)
        add(
          sections.some((s) => s.key === "statement") ? "statement" : "memoria",
          `Mi técnica, en obras como ${sheets
            .slice(0, 3)
            .map((s) => `«${s.title}» (${[s.technique, s.dimensions].filter(Boolean).join(", ")})`)
            .join(" y ")}.`,
        );
    } else if (/impacto|beneficia/.test(f)) {
      const who = seg(/p[uú]blico|vecin|barrio|escuela|niñ|clientes|visitantes/i);
      if (fact && !usedFact) usedFact = add(sections.some((s) => s.key === "objetivos") ? "objetivos" : "memoria", `A quién llega: ${fact.replace(/\.$/, "")}.`);
      else if (who.length) add(sections.some((s) => s.key === "objetivos") ? "objetivos" : "memoria", `A quién llega: ${quote(who)}`, who.map((w) => w.id));
    } else if (/resumen/.test(f)) {
      const parts = [...seg(/\bsoy\b|me llamo/i).slice(0, 1), ...seg(/quiero|proyecto|voy a|queremos/i).slice(0, 1)];
      if (parts.length) add("memoria", `En pocas palabras: ${quote(parts)}`, parts.map((p) => p.id), true);
    }
    if (fact && !usedFact) add("memoria", sentence(fact));
  }
  return { sections, budget: application.budget, checklist: application.checklist };
}

/** A judge's answer for this call: criterionId must be one of the call's ids (no criterion silently counts 0). */
function verdictSchema(call: Call) {
  const ids = call.criteria.map((c) => c.id);
  if (!ids.length) return JudgeVerdict;
  return JudgeVerdict.extend({
    scores: z.array(z.object({ criterionId: z.enum(ids as [string, ...string[]]), points: z.number(), comment: z.string(), fixes: z.array(z.string()) })),
  });
}

const judgeSystem = (estimated: boolean) => `Eres miembro de una comisión de valoración de convocatorias en España. Puntúas una solicitud con ${estimated ? "unos criterios estimados (las bases no publican puntuaciones)" : "los criterios de valoración de las bases"}.
Para cada criterio (criterionId = su id exacto): puntos entre 0 y su máximo, con un baremo realista y constante: premia lo concreto y verificable (fechas, cifras, lugares, nombres, trayectoria con año, a quién llega) y resta por huecos "[Completa: …]" y vaguedades. Un borrador correcto pero genérico ronda el 60 % del máximo; uno concreto, con los huecos resueltos y que responde a cada criterio, puede pasar del 80 %.
Un comentario de una línea y 1-2 mejoras concretas que la persona pueda hacer con sus propios datos (nunca pidas inventar). Si la mejora necesita un dato que no está en la solicitud, nómbralo ("Indica las fechas de…", "Di cuántas personas…").
No ves las obras: valora la calidad artística, la originalidad o la composición por lo que dicen la solicitud y las fichas técnicas, sin penalizar por no ver imágenes.
Español de España. "overall": una frase de valoración global.`;

const REVISE_SYSTEM = `Eres Mecena. Aplicas a una solicitud las mejoras del tribunal simulado que la persona ha aceptado. Tiene la última palabra: luego lo revisará todo.
Devuelve SOLO los cambios, párrafo a párrafo, en "edits" (los párrafos están separados por una línea en blanco):
- Para cambiar un párrafo: "replaces" = su texto actual exacto, "text" = la versión nueva.
- Para añadir uno: "replaces" = null; "after" = el texto exacto del párrafo tras el que va (o null para ponerlo al final).
- Para quitar uno: "replaces" = su texto exacto y "text" = "".
No repitas los párrafos que no cambian.
Ataca primero los criterios peor puntuados ("criteriosMasFlojos"): cada mejora aceptada tiene que notarse en el texto y responder a lo que pide ese criterio, de forma concreta.
Hechos: usa SOLO lo que está en la transcripción, en la solicitud actual, en las fichas de las obras o en "datosDeLaPersona" (lo que la persona acaba de escribir para una mejora: es suyo; úsalo tal cual, sin ampliarlo ni adornarlo). Si un dato suyo resuelve un hueco "[Completa: …]", sustituye el hueco por el dato. Si una mejora necesita un dato que no está, escribe "[Completa: qué falta]"; nunca lo inventes.
Mantén su voz (primera persona) y sus frases. Usa solo las claves de sección que ya existen. "sourceSegmentIds": ids de la transcripción en que se basa el párrafo. No toques el presupuesto. Español de España.
${WORDING_RULE}`;

const RevisePatch = z.object({
  edits: z.array(
    z.object({
      sectionKey: z.string(),
      replaces: z.string().nullable(),
      after: z.string().nullable(),
      text: z.string(),
      sourceSegmentIds: z.array(z.string()),
    }),
  ),
});
export type RevisePatch = z.infer<typeof RevisePatch>;

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const findPara = (paras: string[], text: string | null) => {
  if (!text?.trim()) return -1;
  const t = norm(text);
  const exact = paras.findIndex((p) => norm(p) === t);
  if (exact >= 0) return exact;
  return t.length >= 20 ? paras.findIndex((p) => norm(p).includes(t) || (norm(p).length >= 20 && t.includes(norm(p)))) : -1;
};

/** Apply a paragraph patch to the sections (unknown sections are ignored; an unmatched "replaces" becomes an addition). */
export function applyPatch(sections: readonly ApplicationSection[], patch: RevisePatch): ApplicationSection[] {
  const out = sections.map((s) => ({ ...s, sourceSegmentIds: [...s.sourceSegmentIds] }));
  for (const e of patch.edits) {
    const s = out.find((x) => x.key === e.sectionKey) ?? out.find((x) => fold(x.title) === fold(e.sectionKey));
    if (!s) continue;
    const paras = s.body.split(/\n{2,}/);
    const text = e.text.trim();
    const at = findPara(paras, e.replaces);
    if (at >= 0) {
      if (text) paras[at] = text;
      else paras.splice(at, 1);
    } else if (text && !paras.some((p) => norm(p) === norm(text))) {
      const after = findPara(paras, e.after);
      if (after >= 0) paras.splice(after + 1, 0, text);
      else paras.push(text);
    } else continue;
    s.body = paras.filter((p) => p.trim()).join("\n\n");
    s.sourceSegmentIds = [...new Set([...s.sourceSegmentIds, ...e.sourceSegmentIds])];
  }
  return out;
}

const sheetsOf = (works: readonly Work[] = []) => works.map((w) => ({ titulo: w.sheet.title, año: w.sheet.year, tecnica: w.sheet.technique, medidas: w.sheet.dimensions, serie: w.sheet.series, concepto: w.sheet.concept }));

export const juryAi: AiSlice<"judgeApplication" | "reviseApplication"> = {
  mock: {
    async judgeApplication({ call, application, judge }) {
      return mockVerdict(call, application, judge.id);
    },
    async reviseApplication(input) {
      return mockRevise(input);
    },
  },
  real: {
    async judgeApplication({ call, application, judge, works }) {
      const { judgeTier, judgeEffort } = juryModelConfig();
      const estimated = call.criteriaSource === "estimated" || call.criteria.every((c) => /estimad/i.test(c.description));
      return structured({
        tier: judgeTier,
        effort: judgeEffort,
        system: `${judgeSystem(estimated)}\nTu perfil: ${judge.name}. Te fijas sobre todo en: ${judge.focus}. Tu judgeId es "${judge.id}".`,
        schema: verdictSchema(call),
        maxTokens: 6000,
        user: JSON.stringify(
          {
            convocatoria: {
              titulo: call.title,
              resumen: call.summary,
              criterios: call.criteria.map((c) => ({ id: c.id, nombre: c.name, descripcion: c.description, maximo: c.maxPoints, ...(isVisualCriterion(c) ? { seValoraPor: "la presentación escrita" } : {}) })),
              gastosAdmitidos: call.allowedExpenses,
              importeMaximo: call.amountEur.max ?? null,
            },
            solicitud: { secciones: application.sections.map((s) => ({ titulo: s.title, texto: s.body })), presupuesto: application.budget },
            obras: sheetsOf(works),
          },
          null,
          1,
        ),
      });
    },
    async reviseApplication({ call, application, transcript, fixes, facts = [], weakest = [], works }) {
      const patch = await structured({
        tier: "smart",
        effort: juryModelConfig().reviseEffort,
        system: REVISE_SYSTEM,
        schema: RevisePatch,
        maxTokens: 8000,
        user: JSON.stringify(
          {
            mejorasAceptadas: fixes.map((f) => ({ mejora: f, datoDeLaPersona: facts.find((x) => x.fix === f)?.text ?? null })),
            criteriosMasFlojos: weakest.map((w) => ({ criterio: w.name, puntos: `${w.points}/${w.maxPoints}`, comentarios: w.comments })),
            solicitudActual: application.sections.map((s) => ({ sectionKey: s.key, titulo: s.title, parrafos: s.body.split(/\n{2,}/) })),
            presupuesto: application.budget,
            transcripcion: transcript.map((s) => ({ id: s.id, texto: s.text })),
            obras: sheetsOf(works),
            convocatoria: { titulo: call.title, criterios: call.criteria.map((c) => ({ nombre: c.name, descripcion: c.description, maximo: c.maxPoints })), documentos: call.requiredDocuments },
          },
          null,
          1,
        ),
      });
      const sections = applyPatch(application.sections, patch);
      // budget and checklist stay the user's: the revision never touches them
      const guarded = enforce({ sections, budget: application.budget, checklist: application.checklist }, call, transcript);
      return { ...guarded, budget: application.budget, checklist: application.checklist };
    },
  },
};
