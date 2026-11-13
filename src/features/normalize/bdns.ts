/**
 * BDNS full record (GET /convocatorias?numConv=…&vpd=GE) → canonical fields + Call-contract-shaped patch.
 * For WP-05: run this at ingest on the raw record, then let Claude fill only what BDNS lacks (criteria,
 * documents, age/residence detail from the PDF).
 */
import { z } from "zod";
import type { Call } from "@/contracts/domain";
import { normalizeBeneficiaries, profileKindsFor } from "./beneficiary";
import { normalizeCnae } from "./cnae";
import { resolveDeadline } from "./dates";
import { extractDisciplines } from "./disciplines";
import { formatCents, parseAmount } from "./money";
import { type BeneficiaryType } from "./taxonomy";
import { ccaaOf, normalizeTerritory, territoryName } from "./territory";
import { unique } from "./text";
import { type AmountCents, type CnaeRef, type DataWarning, type Deadline, type Normalized, warn } from "./types";

const Desc = z.object({ descripcion: z.string().nullish() }).passthrough();
export const BdnsRecord = z
  .object({
    codigoBDNS: z.union([z.string(), z.number()]).transform(String),
    descripcion: z.string(),
    organo: z.object({ nivel1: z.string().nullish(), nivel2: z.string().nullish(), nivel3: z.string().nullish() }).passthrough().nullish(),
    tiposBeneficiarios: z.array(Desc).nullish(),
    regiones: z.array(Desc).nullish(),
    sectores: z.array(z.object({ codigo: z.string().nullish(), descripcion: z.string().nullish() }).passthrough()).nullish(),
    presupuestoTotal: z.number().nullish(),
    fechaRecepcion: z.string().nullish(),
    fechaInicioSolicitud: z.string().nullish(),
    fechaFinSolicitud: z.string().nullish(),
    textInicio: z.string().nullish(),
    textFin: z.string().nullish(),
    abierto: z.boolean().nullish(),
    anuncios: z.array(z.object({ datPublicacion: z.string().nullish(), desDiarioOficial: z.string().nullish() }).passthrough()).nullish(),
  })
  .passthrough();
export type BdnsRecord = z.infer<typeof BdnsRecord>;

export interface BdnsNormalized {
  bdnsId: string;
  title: string;
  organizer: string | undefined;
  beneficiaryTypes: BeneficiaryType[]; // empty = BDNS "SIN INFORMACION ESPECIFICA"
  territories: string[];
  sectors: CnaeRef[];
  disciplines: string[]; // found in the title only; Claude/curation may refine
  amount: AmountCents; // BDNS gives the total budget only
  publicationDate: string | null;
  publicationEstimated: boolean; // true when fechaRecepcion stands in for the boletín date
  opensAt: string | undefined;
  deadline: Deadline;
}

export function normalizeBdnsRecord(input: unknown): Normalized<BdnsNormalized> {
  const rec = BdnsRecord.parse(input);
  const warnings: DataWarning[] = [];

  const ben = normalizeBeneficiaries((rec.tiposBeneficiarios ?? []).map((t) => t.descripcion ?? null));
  if (ben.unknown) warnings.push(warn("missing-beneficiary", "tiposBeneficiarios", "BDNS no especifica tipo de beneficiario: no se descarta a nadie por este motivo", undefined, "info"));

  const territories: string[] = [];
  (rec.regiones ?? []).forEach((r, i) => {
    const t = normalizeTerritory(r.descripcion ?? null);
    if (t.id) territories.push(t.id);
    else warnings.push(warn("unmapped-territory", `regiones[${i}]`, `Región BDNS no reconocida: «${r.descripcion}»`, r.descripcion ?? undefined, "error"));
  });
  if (!territories.length) warnings.push(warn("missing-territory", "regiones", "Sin región en BDNS: se trata como estatal", undefined, "warning"));

  const sectors: CnaeRef[] = [];
  (rec.sectores ?? []).forEach((s, i) => {
    const r = normalizeCnae(s);
    if (r.ref) sectors.push(r.ref);
    else warnings.push(warn("unmapped-cnae", `sectores[${i}]`, `Sector BDNS no reconocido: «${s.codigo} ${s.descripcion}»`, s.codigo ?? undefined));
  });

  const pubs = (rec.anuncios ?? []).map((a) => a.datPublicacion?.slice(0, 10)).filter((d): d is string => !!d).sort();
  const publicationDate = pubs[0] ?? rec.fechaRecepcion?.slice(0, 10) ?? null;
  const publicationEstimated = !pubs.length;

  const ccaas = unique(territories.map(ccaaOf).filter((x): x is string => !!x));
  const deadline = resolveDeadline(rec.textFin, publicationDate, { explicitDate: rec.fechaFinSolicitud, regions: ccaas.length === 1 ? ccaas : [] });
  if (publicationEstimated && deadline.date && ["business-days", "calendar-days", "months"].includes(deadline.method)) {
    deadline.estimated = true;
    deadline.note = `${deadline.note ?? ""} (sin fecha de boletín: se usa la fecha de registro en BDNS)`.trim();
  }
  if (!deadline.date && deadline.method !== "rolling")
    warnings.push(warn("missing-deadline", "fechaFinSolicitud", `Sin fecha límite: ${deadline.note ?? "plazo no reconocido"}`, rec.textFin ?? undefined));
  else if (deadline.estimated) warnings.push(warn("estimated-deadline", "textFin", `Fecha límite estimada desde «${rec.textFin}»`, deadline.date ?? undefined, "info"));
  if (deadline.date && publicationDate && deadline.date < publicationDate)
    warnings.push(warn("deadline-before-publication", "fechaFinSolicitud", "La fecha de fin es anterior a la publicación: dato BDNS sospechoso", `${deadline.date}<${publicationDate}`, "error"));

  const totalCents = parseAmount(rec.presupuestoTotal ?? null);

  return {
    value: {
      bdnsId: rec.codigoBDNS,
      title: rec.descripcion.trim(),
      organizer: rec.organo?.nivel3 ?? rec.organo?.nivel2 ?? undefined,
      beneficiaryTypes: ben.ids,
      territories: territories.length ? unique(territories) : ["ES"],
      sectors,
      disciplines: extractDisciplines(rec.descripcion).ids,
      amount: totalCents !== null ? { totalCents } : {},
      publicationDate,
      publicationEstimated,
      opensAt: rec.fechaInicioSolicitud?.slice(0, 10) ?? undefined,
      deadline,
    },
    warnings,
  };
}

/**
 * The same record as a partial `Call` in the CURRENT contract shape, so WP-05 can spread it into a Call
 * today and normalizeCall() reads it back losslessly: residence holds territory names, legalForms holds
 * canonical beneficiary ids, disciplines holds taxonomy ids, sectors holds CNAE codes.
 */
export function bdnsToCallPatch(input: unknown): Pick<Call, "bdnsId" | "title" | "beneficiaryKinds" | "disciplines" | "sectors" | "amountEur" | "amountText" | "deadline" | "deadlineText" | "source"> & {
  organizer?: string;
  opensAt?: string;
  eligibility: Pick<Call["eligibility"], "residence" | "legalForms">;
} {
  const { value: n } = normalizeBdnsRecord(input);
  const rec = BdnsRecord.parse(input);
  const kinds = profileKindsFor(n.beneficiaryTypes);
  return {
    bdnsId: n.bdnsId,
    title: n.title,
    ...(n.organizer ? { organizer: n.organizer } : {}),
    beneficiaryKinds: kinds.length ? kinds : ["creator", "business"],
    disciplines: n.disciplines,
    sectors: n.sectors.map((s) => s.code ?? s.section),
    eligibility: {
      residence: n.territories.includes("ES") || n.territories.includes("WORLD") ? [] : n.territories.map(territoryName),
      legalForms: n.beneficiaryTypes,
    },
    amountEur: n.amount.totalCents !== undefined ? { total: n.amount.totalCents / 100 } : {},
    amountText: n.amount.totalCents !== undefined ? `Presupuesto total: ${formatCents(n.amount.totalCents)}` : "Consultar bases",
    deadline: n.deadline.date,
    deadlineText: n.deadline.date
      ? `${n.deadline.estimated ? "Estimado: " : ""}${rec.textFin?.trim() || n.deadline.date}`
      : rec.textFin?.trim() || "Consultar bases",
    ...(n.opensAt ? { opensAt: n.opensAt } : {}),
    source: "bdns",
  };
}
