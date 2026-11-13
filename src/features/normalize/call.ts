/** Call → CanonicalCall + data-quality warnings. */
import type { Call } from "@/contracts/domain";
import { normalizeBeneficiaries, typesForProfileKind } from "./beneficiary";
import { normalizeCnae } from "./cnae";
import { normalizeCriteria } from "./criteria";
import { resolveDeadline } from "./dates";
import { normalizeDiscipline } from "./disciplines";
import { normalizeDocuments } from "./documents";
import { parseAmountRange, eurosToCents } from "./money";
import { parseAgeRange } from "./ranges";
import { type BeneficiaryType } from "./taxonomy";
import { ccaaOf, normalizeTerritory } from "./territory";
import { unique } from "./text";
import { type AmountCents, type CanonicalCall, type CnaeRef, type DataWarning, type Deadline, type Normalized, warn } from "./types";

export interface NormalizeCallOptions {
  /** Official publication date (BOE/DOG/BOP), needed to compute "N días hábiles desde la publicación". */
  publicationDate?: string;
}

/** Territories the applicant must be within. Empty residence = state-wide (["ES"]), per the Call contract. */
export function callTerritories(call: Pick<Call, "eligibility" | "scope" | "region">): Normalized<string[]> {
  const warnings: DataWarning[] = [];
  const ids: string[] = [];
  call.eligibility.residence.forEach((r, i) => {
    const t = normalizeTerritory(r, { prefer: "broadest" });
    if (t.id) ids.push(t.id);
    else warnings.push(warn("unmapped-territory", `eligibility.residence[${i}]`, `Territorio no reconocido: «${r}»`, r, "error"));
  });
  if (!ids.length && call.eligibility.residence.length === 0 && ["local", "provincial", "autonomico"].includes(call.scope))
    warnings.push(
      warn("territory-implicit", "eligibility.residence", `Ámbito «${call.scope}»${call.region ? ` (${call.region})` : ""} sin residencia exigida: se trata como estatal. Revisa las bases`, call.region, "info"),
    );
  return { value: ids.length ? unique(ids) : ["ES"], warnings };
}

function callBeneficiaries(call: Call): { types: BeneficiaryType[]; source: CanonicalCall["beneficiarySource"]; warnings: DataWarning[] } {
  const warnings: DataWarning[] = [];
  if (call.eligibility.legalForms.length) {
    const r = normalizeBeneficiaries(call.eligibility.legalForms);
    call.eligibility.legalForms.forEach((lf, i) => {
      if (normalizeBeneficiaries([lf]).unknown) warnings.push(warn("unmapped-beneficiary", `eligibility.legalForms[${i}]`, `Tipo de beneficiario no reconocido: «${lf}»`, lf));
    });
    if (r.ids.length) return { types: r.ids, source: "explicit", warnings };
  }
  return { types: unique(call.beneficiaryKinds.flatMap(typesForProfileKind)), source: "kinds", warnings };
}

function callAmount(call: Call): Normalized<AmountCents> {
  const warnings: DataWarning[] = [];
  const a = call.amountEur;
  let amount: AmountCents = {
    ...(a.min !== undefined ? { minCents: eurosToCents(a.min) } : {}),
    ...(a.max !== undefined ? { maxCents: eurosToCents(a.max) } : {}),
    ...(a.total !== undefined ? { totalCents: eurosToCents(a.total) } : {}),
  };
  if (!Object.keys(amount).length) {
    amount = parseAmountRange(call.amountText);
    if (!Object.keys(amount).length && !/consultar|ver bases|variable|en especie/i.test(call.amountText))
      warnings.push(warn("amount-unparsed", "amountText", `No se reconoce un importe en «${call.amountText}»`, call.amountText));
  }
  if (amount.minCents !== undefined && amount.maxCents !== undefined && amount.minCents > amount.maxCents)
    warnings.push(warn("amount-inconsistent", "amountEur", "El importe mínimo es mayor que el máximo", `${amount.minCents}>${amount.maxCents}`, "error"));
  if (amount.maxCents !== undefined && amount.totalCents !== undefined && amount.maxCents > amount.totalCents)
    warnings.push(warn("amount-inconsistent", "amountEur", "La ayuda máxima supera el presupuesto total", `${amount.maxCents}>${amount.totalCents}`, "error"));
  return { value: amount, warnings };
}

function callDeadline(call: Call, territories: string[], opts: NormalizeCallOptions): Normalized<Deadline> {
  const warnings: DataWarning[] = [];
  const ccaas = unique(territories.map(ccaaOf).filter((x): x is string => !!x));
  const regions = ccaas.length === 1 ? ccaas : [];
  let deadline: Deadline;
  if (call.deadline) {
    deadline = { date: call.deadline.slice(0, 10), estimated: /estimad/i.test(call.deadlineText), method: "explicit-field" };
  } else {
    deadline = resolveDeadline(call.deadlineText, opts.publicationDate ?? null, { regions });
  }
  if (!deadline.date && deadline.method !== "rolling" && call.status !== "recurring")
    warnings.push(warn("missing-deadline", "deadline", `Sin fecha límite${deadline.note ? `: ${deadline.note.toLowerCase()}` : ""}`, call.deadlineText, call.status === "open" ? "warning" : "info"));
  if (deadline.date && deadline.estimated) warnings.push(warn("estimated-deadline", "deadline", "Fecha límite estimada: compruébala en el boletín oficial", deadline.date, "info"));
  if (deadline.note?.includes("fuera del calendario")) warnings.push(warn("deadline-outside-calendar", "deadline", deadline.note, deadline.date ?? undefined, "info"));
  return { value: deadline, warnings };
}

export function normalizeCall(call: Call, opts: NormalizeCallOptions = {}): Normalized<CanonicalCall> {
  const warnings: DataWarning[] = [];

  const territories = callTerritories(call);
  warnings.push(...territories.warnings);

  const ben = callBeneficiaries(call);
  warnings.push(...ben.warnings);

  const disc = normalizeDiscipline(call.disciplines);
  for (const u of disc.unmapped) warnings.push(warn("unmapped-discipline", "disciplines", `Disciplina sin equivalencia en la taxonomía: «${u}»`, u));

  const sectors: CnaeRef[] = [];
  call.sectors.forEach((s, i) => {
    const r = normalizeCnae(s);
    if (r.ref) sectors.push(r.ref);
    else warnings.push(warn("unmapped-cnae", `sectors[${i}]`, `Sector sin código CNAE: «${s}»`, s));
  });

  const amount = callAmount(call);
  warnings.push(...amount.warnings);

  const deadline = callDeadline(call, territories.value, opts);
  warnings.push(...deadline.warnings);

  let age = { ...(call.eligibility.minAge !== undefined ? { min: call.eligibility.minAge } : {}), ...(call.eligibility.maxAge !== undefined ? { max: call.eligibility.maxAge } : {}) };
  if (age.min === undefined && age.max === undefined) {
    const parsed = parseAgeRange(call.eligibility.other.join(". "));
    if (Object.keys(parsed).length) age = parsed;
  }
  if (age.min !== undefined && age.max !== undefined && age.min > age.max)
    warnings.push(warn("age-inconsistent", "eligibility", `Edad mínima (${age.min}) mayor que la máxima (${age.max})`, undefined, "error"));

  const docs = normalizeDocuments(call.requiredDocuments);
  for (const u of docs.unmapped) warnings.push(warn("unmapped-document", "requiredDocuments", `Documento sin equivalencia: «${u}»`, u, "info"));

  const crit = normalizeCriteria(call.criteria);
  warnings.push(...crit.warnings.filter((w) => !(w.code === "criteria-empty" && call.criteriaSource === "estimated")));
  if (call.criteriaSource === "bases" && !call.criteria.length)
    warnings.push(warn("criteria-empty", "criteria", "criteriaSource es «bases» pero no hay criterios", undefined, "warning"));

  return {
    value: {
      id: call.id,
      beneficiaryTypes: ben.types,
      beneficiarySource: ben.source,
      territories: territories.value,
      disciplines: disc.any ? [] : disc.ids,
      sectors,
      amount: amount.value,
      ...(call.opensAt ? { opensAt: call.opensAt.slice(0, 10) } : {}),
      deadline: deadline.value,
      age,
      ...(call.eligibility.maxEmployees !== undefined ? { maxEmployees: call.eligibility.maxEmployees } : {}),
      requiredDocuments: docs.ids,
      criteria: crit.criteria,
    },
    warnings,
  };
}
