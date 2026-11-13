// Maps a raw BDNS record + its AI enrichment into the normalised Call contract.
import { bdnsPublicUrl, documentUrl, mapBeneficiaries, mapRegions, type BdnsDetail } from './bdns.ts';
import type { Enrichment } from './enrich.ts';
import type { Audience, Call, Requirement } from './types.ts';

export interface SelectedCall {
  codigoBDNS: string;
  audiences: Audience[];
  docId: number; // which BDNS document holds the bases
  title?: string; // short display title (BDNS titles are often long legal names)
  url?: string; // better public page than the BDNS record, if any
}

const toIso = (d: string | null | undefined): string | undefined => {
  if (!d) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = d.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};

function mapRequirement(r: Enrichment['requirements'][number]): Requirement {
  switch (r.kind) {
    case 'age':
      return { kind: 'age', text: r.text, ...(r.min !== null && { min: r.min }), ...(r.max !== null && { max: r.max }) };
    case 'residence':
      return { kind: 'residence', regions: r.regions, text: r.text };
    case 'autonomo':
      return { kind: 'autonomo', required: r.required ?? true, text: r.text };
    case 'cnae':
      return { kind: 'cnae', codes: r.codes, text: r.text };
    case 'years_active':
      return { kind: 'years_active', min: r.min ?? 0, text: r.text };
    case 'max_employees':
      return { kind: 'max_employees', max: r.max ?? 0, text: r.text };
    default:
      return { kind: 'other', text: r.text };
  }
}

export function bdnsToCall(d: BdnsDetail, e: Enrichment, sel: SelectedCall, verifiedAt: string): Call {
  const officialDeadline = toIso(d.fechaFinSolicitud);
  const deadline = officialDeadline ?? e.deadline ?? undefined;
  const maxScore = e.criteria.length ? e.criteria.reduce((s, c) => s + c.weight, 0) : undefined;
  return {
    id: `bdns-${d.codigoBDNS}`,
    source: 'bdns',
    codigoBDNS: d.codigoBDNS,
    url: sel.url ?? bdnsPublicUrl(d.codigoBDNS),
    basesUrl: documentUrl(sel.docId),
    title: sel.title ?? d.descripcion,
    issuer: [d.organo.nivel2, d.organo.nivel3].filter(Boolean).join(' · '),
    audiences: sel.audiences,
    beneficiaryTypes: mapBeneficiaries(d),
    regions: mapRegions(d),
    disciplines: e.disciplines,
    amountTotal: d.presupuestoTotal ?? undefined,
    amountPerBeneficiary:
      e.amountPerBeneficiaryMin !== null || e.amountPerBeneficiaryMax !== null || e.amountText
        ? {
            ...(e.amountPerBeneficiaryMin !== null && { min: e.amountPerBeneficiaryMin }),
            ...(e.amountPerBeneficiaryMax !== null && { max: e.amountPerBeneficiaryMax }),
            ...(e.amountText && { text: e.amountText }),
          }
        : undefined,
    opensAt: toIso(d.fechaInicioSolicitud),
    deadline,
    deadlineEstimated: !officialDeadline && Boolean(deadline),
    deadlineText: e.deadlineText ?? d.textFin ?? undefined,
    procedure: e.procedure,
    requirements: e.requirements.map(mapRequirement),
    criteria: e.criteria,
    criteriaWeightsStated: e.criteriaWeightsStated,
    maxScore,
    requiredDocs: e.requiredDocs,
    eligibleExpenses: e.eligibleExpenses,
    summaryPlain: e.summaryPlain,
    keywords: e.keywords,
    verifiedAt,
  };
}
