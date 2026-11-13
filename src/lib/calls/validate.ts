import type { Call } from './types.ts';

const SOURCES = ['bdns', 'private', 'seed'];
const BENEFICIARIES = ['persona_fisica', 'autonomo_pyme', 'entidad_sin_animo', 'gran_empresa'];
const AUDIENCES = ['creador', 'pyme'];
const REQUIREMENT_KINDS = ['age', 'residence', 'autonomo', 'cnae', 'years_active', 'max_employees', 'other'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Returns a list of contract violations; empty means the call is valid.
export function validateCall(c: Call): string[] {
  const e: string[] = [];
  const nonEmpty = (v: unknown, f: string) => {
    if (typeof v !== 'string' || v.trim() === '') e.push(`${f} is required`);
  };

  nonEmpty(c.id, 'id');
  nonEmpty(c.title, 'title');
  nonEmpty(c.issuer, 'issuer');
  nonEmpty(c.summaryPlain, 'summaryPlain');
  if (!SOURCES.includes(c.source)) e.push(`source invalid: ${c.source}`);
  if (c.source === 'bdns' && !c.codigoBDNS) e.push('codigoBDNS required for bdns source');
  if (!/^https?:\/\//.test(c.url ?? '')) e.push('url must be http(s)');
  if (c.basesUrl && !/^https?:\/\//.test(c.basesUrl)) e.push('basesUrl must be http(s)');

  if (!c.audiences?.length || c.audiences.some((a) => !AUDIENCES.includes(a))) e.push('audiences invalid');
  if (!c.beneficiaryTypes?.length || c.beneficiaryTypes.some((b) => !BENEFICIARIES.includes(b)))
    e.push('beneficiaryTypes invalid');
  if (!c.regions?.length) e.push('regions required');
  if (!c.disciplines?.length) e.push('disciplines required');

  for (const f of ['opensAt', 'deadline', 'verifiedAt'] as const) {
    const v = c[f];
    if (v !== undefined && !ISO_DATE.test(v)) e.push(`${f} must be YYYY-MM-DD`);
  }
  if (!c.verifiedAt) e.push('verifiedAt required');
  if (typeof c.deadlineEstimated !== 'boolean') e.push('deadlineEstimated must be boolean');
  if (!c.deadline && !c.deadlineText) e.push('deadline or deadlineText required');

  for (const r of c.requirements ?? []) {
    if (!REQUIREMENT_KINDS.includes(r.kind)) e.push(`requirement kind invalid: ${r.kind}`);
    if (!r.text) e.push('requirement text required');
  }

  if (!['competitiva', 'no_competitiva'].includes(c.procedure)) e.push(`procedure invalid: ${c.procedure}`);
  if (c.procedure === 'competitiva' && !c.criteria?.length) e.push('criteria required for competitiva');
  if (typeof c.criteriaWeightsStated !== 'boolean') e.push('criteriaWeightsStated must be boolean');
  for (const cr of c.criteria ?? []) {
    if (!cr.name || typeof cr.weight !== 'number' || cr.weight <= 0) e.push(`criterion invalid: ${cr.name}`);
  }
  if (c.criteria?.length && c.maxScore !== undefined) {
    const sum = c.criteria.reduce((s, cr) => s + cr.weight, 0);
    if (Math.abs(sum - c.maxScore) > 0.01) e.push(`criteria weights sum ${sum} != maxScore ${c.maxScore}`);
  }

  if (!Array.isArray(c.requiredDocs) || !c.requiredDocs.length) e.push('requiredDocs required');
  if (!Array.isArray(c.eligibleExpenses)) e.push('eligibleExpenses must be an array');
  if (!Array.isArray(c.keywords) || !c.keywords.length) e.push('keywords required');
  return e;
}
