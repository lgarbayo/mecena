// Layer 2 — AI enrichment of a call's bases PDF (fleet/DATA-PIPELINE.md §2).
// Claude reads the bases once per call; the result is cached. Matching never calls the LLM.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const RequirementSchema = z.object({
  kind: z.enum(['age', 'residence', 'autonomo', 'cnae', 'years_active', 'max_employees', 'other']),
  text: z.string().describe('Requirement as stated in the bases, in Spanish'),
  min: z.number().nullable().describe('age min / years_active min, else null'),
  max: z.number().nullable().describe('age max / max_employees, else null'),
  regions: z.array(z.string()).describe('residence: NUTS codes, e.g. ES11 (Galicia), ES111 (A Coruña); else []'),
  codes: z.array(z.string()).describe('cnae: CNAE codes; else []'),
  required: z.boolean().nullable().describe('autonomo: must be registered as autónomo; else null'),
});

export const EnrichmentSchema = z.object({
  summaryPlain: z.string().describe('2-3 sentence plain-language summary in Spanish (Spain), tú form'),
  disciplines: z.array(z.string()).describe('snake_case, e.g. artes_visuales, ilustracion, fotografia, literatura, musica, digitalizacion, contratacion, turismo'),
  keywords: z.array(z.string()),
  amountPerBeneficiaryMin: z.number().nullable(),
  amountPerBeneficiaryMax: z.number().nullable(),
  amountText: z.string().nullable().describe('e.g. "1.º premio 1.500 €, 2.º 800 €"'),
  deadline: z.string().nullable().describe('YYYY-MM-DD if a concrete date can be determined, else null'),
  deadlineText: z.string().nullable(),
  procedure: z.enum(['competitiva', 'no_competitiva']).describe('no_competitiva = resolved by order of arrival until budget runs out'),
  requirements: z.array(RequirementSchema),
  criteria: z.array(z.object({ name: z.string(), weight: z.number(), description: z.string() })).describe(
    'Scored evaluation criteria with their points or %. Prizes judged by a jury without stated weights: list the jury criteria and split 100 evenly.',
  ),
  criteriaWeightsStated: z.boolean().describe('false if weights were not in the bases and were split evenly'),
  requiredDocs: z.array(z.string()),
  eligibleExpenses: z.array(z.string()),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

export interface BasesExtractor {
  extract(input: { title: string; pdf: Buffer }): Promise<Enrichment>;
}

const SYSTEM = `Extraes datos estructurados de las bases de convocatorias públicas y privadas españolas (subvenciones, becas, premios, residencias).
Sé literal: no inventes requisitos, importes ni criterios que no estén en el documento. Si un dato no aparece, usa null o [].
Los criterios de valoración son la parte más importante: copia nombre, puntuación o peso y qué valoran.`;

export class ClaudeBasesExtractor implements BasesExtractor {
  private client = new Anthropic();

  async extract({ title, pdf }: { title: string; pdf: Buffer }): Promise<Enrichment> {
    const res = await this.client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: zodOutputFormat(EnrichmentSchema) },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
            { type: 'text', text: `Convocatoria: ${title}\nExtrae los datos según el esquema.` },
          ],
        },
      ],
    });
    if (res.stop_reason === 'refusal') throw new Error(`extraction refused for "${title}"`);
    if (!res.parsed_output) throw new Error(`no parsed output for "${title}" (stop_reason ${res.stop_reason})`);
    return res.parsed_output;
  }
}

// Deterministic stand-in so the pipeline and tests run without ANTHROPIC_API_KEY.
export class MockBasesExtractor implements BasesExtractor {
  async extract({ title }: { title: string; pdf: Buffer }): Promise<Enrichment> {
    return {
      summaryPlain: `Resumen pendiente de revisar: ${title}.`,
      disciplines: ['por_clasificar'],
      keywords: title.toLowerCase().split(/\W+/).filter((w) => w.length > 4).slice(0, 5),
      amountPerBeneficiaryMin: null,
      amountPerBeneficiaryMax: null,
      amountText: null,
      deadline: null,
      deadlineText: null,
      procedure: 'competitiva',
      requirements: [],
      criteria: [{ name: 'Calidad de la propuesta', weight: 100, description: 'Pendiente de extraer de las bases.' }],
      criteriaWeightsStated: false,
      requiredDocs: ['Solicitud'],
      eligibleExpenses: [],
    };
  }
}

export function defaultExtractor(): BasesExtractor {
  return process.env.ANTHROPIC_API_KEY ? new ClaudeBasesExtractor() : new MockBasesExtractor();
}
