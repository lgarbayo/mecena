/**
 * Loads data/taxonomy/*.json and validates it with zod at import time, so a broken edit to a
 * vocabulary fails the test suite instead of silently breaking matching.
 */
import { z } from "zod";
import disciplinesJson from "../../../data/taxonomy/disciplines.json";
import territoriesJson from "../../../data/taxonomy/territories.json";
import beneficiaryJson from "../../../data/taxonomy/beneficiary-types.json";
import documentsJson from "../../../data/taxonomy/documents.json";
import cnaeJson from "../../../data/taxonomy/cnae.json";
import holidaysJson from "../../../data/taxonomy/holidays.json";

const Labels = z.object({ es: z.string().min(1), gl: z.string().min(1) });
const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const DisciplineTaxonomy = z.object({
  version: z.string(),
  anyPhrases: z.array(z.string()),
  items: z.array(
    z.object({
      id: Slug,
      parent: Slug.nullable(),
      label: Labels,
      cnae: z.array(z.string()).default([]),
      synonyms: z.array(z.string()).default([]),
    }),
  ),
});
export type DisciplineTaxonomy = z.infer<typeof DisciplineTaxonomy>;

export const TerritoryLevel = z.enum(["world", "country", "nuts1", "ccaa", "province", "municipality"]);
export type TerritoryLevel = z.infer<typeof TerritoryLevel>;

export const TerritoryTaxonomy = z.object({
  version: z.string(),
  items: z.array(
    z.object({
      id: z.string().regex(/^(WORLD|ES[0-9A-Z]{0,3}|mun:\d{5})$/),
      parent: z.string().nullable(),
      level: TerritoryLevel,
      name: z.string().min(1),
      names: z.array(z.string()).default([]),
      ine: z.string().optional(),
      bdnsId: z.number().int().optional(),
    }),
  ),
});
export type TerritoryNode = z.infer<typeof TerritoryTaxonomy>["items"][number];

import { BeneficiaryType } from "@/contracts/domain";
export { BeneficiaryType };

export const BeneficiaryTaxonomy = z.object({
  version: z.string(),
  items: z.array(
    z.object({
      id: BeneficiaryType,
      label: Labels,
      profileKinds: z.array(z.enum(["creator", "business"])),
      synonyms: z.array(z.string()),
    }),
  ),
  bdns: z.array(z.object({ id: z.number().int(), descripcion: z.string(), canonical: z.array(BeneficiaryType) })),
  legalForms: z.record(z.string(), BeneficiaryType.nullable()),
  pymeLimits: z.object({ maxEmployees: z.number().int(), maxAnnualRevenueEur: z.number() }),
});

export const DocumentTaxonomy = z.object({
  version: z.string(),
  items: z.array(z.object({ id: Slug, label: Labels, synonyms: z.array(z.string()) })),
});

export const CnaeTaxonomy = z.object({
  version: z.string(),
  sections: z.array(z.object({ code: z.string().regex(/^[A-V]$/), label: z.string(), divisions: z.tuple([z.number().int(), z.number().int()]) })),
  codes: z.array(z.object({ code: z.string().regex(/^\d{2}(\.\d{1,2})?$/), label: z.string() })),
  legacy2009: z.record(z.string().regex(/^\d{4}$/), z.string()),
});

export const HolidayCalendar = z.object({
  version: z.string(),
  coverage: z.object({ from: IsoDate, to: IsoDate }),
  national: z.record(z.string(), z.array(IsoDate)),
  regional: z.record(z.string(), z.record(z.string(), z.array(IsoDate))),
});

export const taxonomy = {
  disciplines: DisciplineTaxonomy.parse(disciplinesJson),
  territories: TerritoryTaxonomy.parse(territoriesJson),
  beneficiaries: BeneficiaryTaxonomy.parse(beneficiaryJson),
  documents: DocumentTaxonomy.parse(documentsJson),
  cnae: CnaeTaxonomy.parse(cnaeJson),
  holidays: HolidayCalendar.parse(holidaysJson),
};

export type DocumentType = string; // one of taxonomy.documents.items[].id
export const DOCUMENT_IDS: readonly string[] = taxonomy.documents.items.map((d) => d.id);
export const DISCIPLINE_IDS: readonly string[] = taxonomy.disciplines.items.map((d) => d.id);
