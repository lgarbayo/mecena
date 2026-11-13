// Normalised call (convocatoria) contract. One schema for every source:
// BDNS public grants, private calls (foundations, prizes, residencies) and the curated seed.
// See fleet/DATA-PIPELINE.md.

export type CallSource = 'bdns' | 'private' | 'seed';

// Who may apply. Mirrors BDNS `tiposBeneficiarios` in our own vocabulary.
export type BeneficiaryType =
  | 'persona_fisica' // PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA
  | 'autonomo_pyme' // PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA
  | 'entidad_sin_animo' // PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA
  | 'gran_empresa';

// Which app mode a call is shown in.
export type Audience = 'creador' | 'pyme';

// Machine-checkable eligibility rule. Matching evaluates these in code (never via the LLM).
// A rule whose profile field is unknown is surfaced as "Confírmalo", not as a discard.
export type Requirement =
  | { kind: 'age'; min?: number; max?: number; text: string }
  | { kind: 'residence'; regions: string[]; text: string } // NUTS codes, e.g. "ES11"
  | { kind: 'autonomo'; required: boolean; text: string }
  | { kind: 'cnae'; codes: string[]; text: string }
  | { kind: 'years_active'; min: number; text: string }
  | { kind: 'max_employees'; max: number; text: string }
  | { kind: 'other'; text: string }; // not machine-checkable: always shown as "Confírmalo"

// competitiva: a committee/jury scores applications against `criteria`.
// no_competitiva: first-come until the budget runs out; meeting requirements + complete paperwork is what matters.
export type Procedure = 'competitiva' | 'no_competitiva';

export interface Criterion {
  name: string;
  weight: number; // points or percent as stated in the bases; weights of a call sum to `maxScore`
  description: string;
}

export interface Call {
  id: string; // stable slug, e.g. "bdns-940540" or "priv-fundacion-x-2026"
  source: CallSource;
  codigoBDNS?: string;
  url: string; // official page or bases (source of truth)
  basesUrl?: string; // direct link to the bases / convocatoria PDF when available

  title: string;
  issuer: string;
  audiences: Audience[];
  beneficiaryTypes: BeneficiaryType[];
  regions: string[]; // NUTS codes where applicants must be based; ["ES"] = all of Spain
  disciplines: string[]; // e.g. "artes_visuales", "ilustracion", "fotografia", "digitalizacion"
  cnae?: string[];

  amountTotal?: number; // EUR, whole budget of the call
  amountPerBeneficiary?: { min?: number; max?: number; text?: string }; // EUR

  opensAt?: string; // ISO date
  deadline?: string; // ISO date; undefined when it cannot be determined
  deadlineEstimated: boolean; // true when computed from text ("20 días hábiles desde…")
  deadlineText?: string; // original wording from BDNS / bases

  procedure: Procedure;
  requirements: Requirement[];
  criteria: Criterion[]; // empty for no_competitiva
  criteriaWeightsStated: boolean; // false when the bases list criteria without points and weights were split evenly
  maxScore?: number;
  fee?: { amount?: number; text: string }; // entry fee in EUR (private calls); amount omitted when not published
  requiredDocs: string[];
  eligibleExpenses: string[];

  summaryPlain: string; // es-ES plain-language summary of the bases
  keywords: string[];

  verifiedAt: string; // ISO date the data was last checked against the source
}
