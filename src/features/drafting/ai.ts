// Owned by WP-08. Drafts the application from the user's own words (transcript segment ids), criteria-aware.
// Mock: deterministic, quotes the transcript verbatim. Real: Claude smart tier. Both pass through ./rules.enforce.
import { ApplicationDraftContent, type AiSlice, type ApplicationSection, type BudgetLine, type Call, type DraftApplicationInput, type Profile, type TranscriptSegment } from "@/contracts";
import { structured } from "@/server/ai/llm";
import { buildChecklist, enforce } from "./rules";

const pick = (segs: TranscriptSegment[], re: RegExp) => segs.filter((s) => re.test(s.text.toLowerCase()));
const quote = (segs: TranscriptSegment[]) => segs.map((s) => s.text.trim()).join(" ");

/** Funding needs → allowed expense types (first match wins). */
const NEED_TO_EXPENSE: [RegExp, RegExp][] = [
  [/produc|serie|obra/, /produc/],
  [/acuarel|pintur|papel|material|lienzo|pigment/, /material/],
  [/fanzine|edit|libro|public|catalog|imprim/, /edici|public|impres/],
  [/tiempo|honorar|dedicaci/, /honorar/],
  [/tienda|online|web|ecommerce/, /tienda|web|online/],
  [/software|gesti|programa/, /software/],
  [/consult|asesor/, /consult/],
  [/ordenador|equipo|portatil|tablet/, /equipo/],
];

/** Prizes, contests and open calls pay a fixed award: they ask for no budget. */
export const needsBudget = (call: Pick<Call, "type" | "allowedExpenses">) => call.allowedExpenses.length > 0 || !["premio", "certamen", "convocatoria"].includes(call.type);

function budgetFromNeeds(profile: Profile, call: Call): BudgetLine[] {
  if (!needsBudget(call)) return [];
  const allowed = call.allowedExpenses;
  const lines: BudgetLine[] = [];
  for (const need of profile.fundingNeeds) {
    const n = need.toLowerCase();
    const rule = NEED_TO_EXPENSE.find(([needRe]) => needRe.test(n));
    const type = allowed.length ? allowed.find((a) => rule && rule[1].test(a.toLowerCase())) : "Gastos del proyecto";
    if (!type || (allowed.length > 0 && lines.some((l) => l.expenseType === type))) continue;
    lines.push({ concept: need.charAt(0).toUpperCase() + need.slice(1), amountEur: 0, expenseType: type, note: "Importe orientativo: ajústalo a tus presupuestos" });
  }
  const cap = call.amountEur.max ?? 3000;
  const each = lines.length ? Math.floor((cap * 0.9) / lines.length / 50) * 50 : 0;
  return lines.map((l) => ({ ...l, amountEur: each }));
}

function creatorSections(p: Profile, call: Call, t: TranscriptSegment[]): ApplicationSection[] {
  const projectSegs = pick(t, /quiero|proyecto|serie|hacer|preparo|voy a/);
  const voiceSegs = pick(t, /porque|pinto|trabajo|me interesa|mi obra|fotograf|ilustr|escrib/).filter((s) => !projectSegs.includes(s));
  const memoria = [
    projectSegs.length ? quote(projectSegs) : p.projectIdea || "[Completa: qué proyecto quieres presentar]",
    p.projectIdea && projectSegs.length && !quote(projectSegs).includes(p.projectIdea) ? p.projectIdea : "",
    p.fundingNeeds.length ? `Con la ayuda quiero ${p.fundingNeeds.join(", ")}.` : "",
    call.region && (p.city || p.region) ? `Vivo y trabajo en ${p.city ?? p.region}, así que el proyecto nace aquí.` : "",
    "Calendario: [Completa: fechas de inicio y fin y las fases del trabajo]",
  ].filter(Boolean);
  const statement = [voiceSegs.length ? quote(voiceSegs) : p.statement || "[Completa: qué te mueve a crear y sobre qué trabajas]"];
  const cv = [...p.achievements.map((a) => `- ${a}`), ...p.education.map((e) => `- ${e}`)];
  return [
    { key: "memoria", title: "Memoria del proyecto", body: memoria.join("\n\n"), sourceSegmentIds: (projectSegs.length ? projectSegs : t).map((s) => s.id) },
    { key: "statement", title: "Declaración artística", body: statement.join("\n\n"), sourceSegmentIds: (voiceSegs.length ? voiceSegs : t).map((s) => s.id) },
    { key: "cv", title: "Trayectoria", body: cv.length ? cv.join("\n") : "[Completa: exposiciones, premios y formación con año y lugar]", sourceSegmentIds: [] },
  ];
}

function businessSections(p: Profile, _call: Call, t: TranscriptSegment[]): ApplicationSection[] {
  const facts = [
    p.foundedYear && `desde ${p.foundedYear}`,
    p.city && `en ${p.city}`,
    p.employees !== undefined && `${p.employees} ${p.employees === 1 ? "persona" : "personas"} en plantilla`,
    p.sector && `sector ${p.sector}`,
  ].filter(Boolean);
  const company = [`${p.displayName || "[Completa: nombre comercial]"}${facts.length ? `: ${facts.join(", ")}.` : "."}`, p.bio, ...p.achievements.map((a) => `- ${a}`)].filter(Boolean);
  const memoria = [
    quote(pick(t, /quiero|proyecto|vamos a|queremos/)) || p.projectIdea || "[Completa: qué proyecto quieres financiar]",
    p.fundingNeeds.length ? `Necesitamos: ${p.fundingNeeds.join(", ")}.` : "",
    "Presupuestos de proveedores: [Completa: adjunta al menos uno por partida]",
  ].filter(Boolean);
  const objetivos = [p.statement || "[Completa: qué quieres conseguir con el proyecto]", "Indicadores: [Completa: ventas, clientes o empleo esperados en 12 meses]"];
  return [
    { key: "company", title: "La empresa", body: company.join("\n\n"), sourceSegmentIds: [] },
    { key: "memoria", title: "Memoria del proyecto", body: memoria.join("\n\n"), sourceSegmentIds: pick(t, /quiero|proyecto|vamos a|queremos/).map((s) => s.id) },
    { key: "objetivos", title: "Objetivos e impacto", body: objetivos.join("\n\n"), sourceSegmentIds: [] },
  ];
}

export function mockDraft({ profile, call, transcript }: DraftApplicationInput) {
  const sections = profile.kind === "creator" ? creatorSections(profile, call, transcript) : businessSections(profile, call, transcript);
  return enforce({ sections, budget: budgetFromNeeds(profile, call), checklist: buildChecklist(call) }, call, transcript.map((s) => s.id));
}

const SYSTEM = `Eres Mecena: preparas solicitudes de convocatorias (becas, premios, ayudas) para artistas, pymes y autónomos de España.
Escribe en español de España y en primera persona, con la voz de la persona: usa sus frases y su vocabulario de la transcripción (cítalas o parafraséalas de cerca).
NUNCA inventes datos (fechas, cifras, exposiciones, clientes, premios) que no estén en la transcripción o el perfil. Si falta algo que las bases piden, escribe "[Completa: qué falta]".
Organiza las secciones para responder a cada criterio de valoración de la convocatoria. Cada sección lista en sourceSegmentIds los ids de los fragmentos de la transcripción en los que se basa.
Secciones: creador/a → "memoria", "statement" y, si hay datos, "cv"; pyme/autónomo → "company", "memoria", "objetivos".
Presupuesto: solo partidas cuyo expenseType sea exactamente uno de los gastos admitidos; total ≤ importe máximo. Checklist: los documentos que piden las bases.
La persona tiene la última palabra: escribe un borrador claro y honesto que pueda editar.`;

export const draftingAi: AiSlice<"draftApplication"> = {
  mock: {
    async draftApplication(input) {
      return mockDraft(input);
    },
  },
  real: {
    async draftApplication(input) {
      const { profile, call, transcript, works } = input;
      const content = await structured({
        tier: "smart",
        system: SYSTEM,
        schema: ApplicationDraftContent,
        user: JSON.stringify(
          {
            tipo: profile.kind === "creator" ? "creador/a" : "pyme/autónomo",
            perfil: { ...profile, id: undefined, updatedAt: undefined },
            transcripcion: transcript.map((s) => ({ id: s.id, texto: s.text })),
            obras: works.map((w) => w.sheet),
            convocatoria: {
              titulo: call.title,
              resumen: call.summary,
              criterios: call.criteria.map((c) => ({ nombre: c.name, descripcion: c.description, puntos: c.maxPoints })),
              gastosAdmitidos: call.allowedExpenses,
              importeMaximo: call.amountEur.max ?? null,
              documentos: call.requiredDocuments,
              requisitos: call.eligibility.other,
            },
          },
          null,
          1,
        ),
      });
      return enforce(content, call, transcript.map((s) => s.id));
    },
  },
};
