// Owned by WP-05. Claude structures a call's bases / BDNS record text into the Call contract.
// It only fills what the text states; ids, URLs, dates and BDNS fields are set by code (ingest.ts).
import { z } from "zod";
import { CallScope, CallType, ProfileKind, type AiSlice, type Call } from "@/contracts";
import { normalizeDiscipline } from "@/features/normalize";
import { structured } from "@/server/ai/llm";

const Extracted = z.object({
  title: z.string().describe("Título corto y claro en español, sin fórmulas legales"),
  organizer: z.string(),
  type: CallType,
  scope: CallScope,
  region: z.string().nullable().describe('Comunidad o provincia si es local/provincial/autonómica, p. ej. "Galicia", "A Coruña"; null si estatal'),
  beneficiaryKinds: z.array(ProfileKind).min(1).describe('"creator" = artistas a título individual; "business" = autónomos, pymes, entidades'),
  disciplines: z.array(z.string()).describe("Disciplinas artísticas mencionadas (pintura, fotografía, ilustración…); [] si cualquiera"),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  residence: z.array(z.string()).describe("Solo si el texto EXIGE residir/empadronarse en un sitio; [] si no lo dice"),
  maxEmployees: z.number().int().nullable(),
  otherRequirements: z.array(z.string()),
  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),
  amountText: z.string().describe('Importe por beneficiario como lo dice el texto, o "Consultar bases"'),
  summary: z.string().describe("2-3 frases en español de España, tuteando: quién puede pedirla, cuánto, qué piden"),
  requiredDocuments: z.array(z.string()),
  criteria: z.array(z.object({ name: z.string(), description: z.string(), maxPoints: z.number() })).describe("SOLO si el texto publica criterios con puntos; si no, []"),
  allowedExpenses: z.array(z.string()),
});

const SYSTEM = `Estructuras convocatorias públicas y privadas españolas (subvenciones, becas, premios, residencias) a partir de su texto.
Español de España. Sé literal: nunca inventes requisitos, importes, plazos ni criterios que no estén en el texto; si falta un dato usa null, [] o "Consultar bases".
Los criterios de valoración solo se incluyen si el texto publica sus puntos.`;

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "criterio";

/** Rescale criteria to sum exactly 100 (largest remainder), keeping their order. */
function to100(points: number[]): number[] {
  const total = points.reduce((s, p) => s + p, 0);
  if (!total) return points.map(() => 0);
  const raw = points.map((p) => (p * 100) / total);
  const out = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < 100 - out.reduce((s, p) => s + p, 0); k++) out[order[k][1]] += 1;
  return out;
}

function toCall(x: z.infer<typeof Extracted>, sourceUrl: string, bdnsId?: string): Call {
  const crit = x.criteria.filter((c) => c.maxPoints > 0);
  const pts = to100(crit.map((c) => c.maxPoints));
  const seen = new Set<string>();
  return {
    id: `bdns-${bdnsId ?? "unknown"}`,
    beneficiaryTypes: [],
    territories: [],
    title: x.title,
    organizer: x.organizer,
    type: x.type,
    scope: x.scope,
    ...(x.region ? { region: x.region } : {}),
    beneficiaryKinds: x.beneficiaryKinds,
    disciplines: normalizeDiscipline(x.disciplines).ids,
    sectors: [],
    eligibility: {
      ...(x.minAge !== null ? { minAge: x.minAge } : {}),
      ...(x.maxAge !== null ? { maxAge: x.maxAge } : {}),
      ...(x.maxEmployees !== null ? { maxEmployees: x.maxEmployees } : {}),
      residence: x.residence,
      legalForms: [],
      other: x.otherRequirements,
    },
    amountEur: { ...(x.amountMin !== null ? { min: x.amountMin } : {}), ...(x.amountMax !== null ? { max: x.amountMax } : {}) },
    amountText: x.amountText || "Consultar bases",
    deadline: null,
    deadlineText: "Consultar bases",
    status: "open",
    summary: x.summary,
    requiredDocuments: x.requiredDocuments,
    criteria: crit.map((c, i) => {
      let id = slug(c.name);
      while (seen.has(id)) id += "-2";
      seen.add(id);
      return { id, name: c.name, description: c.description, maxPoints: pts[i] };
    }),
    criteriaSource: crit.length ? "bases" : "estimated",
    allowedExpenses: x.allowedExpenses,
    sourceUrl,
    ...(bdnsId ? { bdnsId } : {}),
    source: "bdns",
    verifiedAt: new Date().toISOString().slice(0, 10),
  };
}

export const callsIngestAi: AiSlice<"structureCall"> = {
  mock: {
    async structureCall({ rawText, sourceUrl, bdnsId }): Promise<Call> {
      return {
        id: `bdns-${bdnsId ?? "unknown"}`,
        beneficiaryTypes: [],
        territories: [],
        title: rawText.replace(/^Título:\s*/, "").split("\n")[0].slice(0, 80) || "Convocatoria",
        organizer: "Desconocido",
        type: "convocatoria",
        scope: "estatal",
        beneficiaryKinds: ["business"],
        disciplines: [],
        sectors: [],
        eligibility: { residence: [], legalForms: [], other: [] },
        amountEur: {},
        amountText: "Consultar bases",
        deadline: null,
        deadlineText: "Consultar bases",
        status: "open",
        summary: rawText.slice(0, 240),
        requiredDocuments: [],
        criteria: [],
        criteriaSource: "estimated",
        allowedExpenses: [],
        sourceUrl,
        bdnsId,
        source: "bdns",
        verifiedAt: new Date().toISOString().slice(0, 10),
      };
    },
  },
  real: {
    async structureCall({ rawText, sourceUrl, bdnsId }) {
      const x = await structured({ tier: "fast", system: SYSTEM, schema: Extracted, user: rawText, maxTokens: 8000, effort: "medium" });
      return toCall(x, sourceUrl, bdnsId);
    },
  },
};
