/**
 * Demo scenarios (plan B): ready-made accounts loaded from data/demo/*.json into the signed-in account only.
 * Server-only. The files are validated with the domain contracts here and in tests/demo/scenarios.test.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ApplicationSection, BudgetLine, Call, DossierSection, Profile, TechnicalSheet, TranscriptSegment } from "@/contracts";
import { DemoScenario } from "@/contracts/api";
import { SAMPLE_INVOICE_URL } from "./sample-invoice";

export { DemoScenario };
export type DemoScenarioId = z.infer<typeof DemoScenario>;

/** Where the scenario files live (data/demo, next to the curated calls in data/calls). */
export function demoDataDir(): string {
  return path.resolve(process.cwd(), process.env.MECENA_DEMO_DIR || "data/demo");
}

const ScenarioProfile = Profile.omit({ id: true, ownerId: true, updatedAt: true, territory: true, beneficiaryTypes: true });
const ScenarioSegment = TranscriptSegment.omit({ at: true });
const ScenarioSection = DossierSection.omit({ updatedAt: true });

export const PersonaFile = z.object({
  profile: ScenarioProfile,
  transcript: z.array(ScenarioSegment).min(1),
  dossier: z.array(ScenarioSection).min(1),
  works: z
    .array(z.object({ image: z.string().regex(/^[\w.-]+\.(png|jpg|jpeg|webp)$/), sheet: TechnicalSheet }))
    .default([]),
});
export type PersonaFile = z.infer<typeof PersonaFile>;

export const ProFile = z.object({
  callIds: z.array(z.string()).min(1), // first one that exists and is open wins
  application: z.object({ sections: z.array(ApplicationSection).min(1), budget: z.array(BudgetLine).default([]) }),
});
export type ProFile = z.infer<typeof ProFile>;

/** The invoices of the justification demo (IDEA #7): `invoices` are already on the Pro application, `sample` is the one photographed live. */
const InvoiceReading = z.object({
  supplier: z.string(),
  taxId: z.string(),
  number: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  concept: z.string(),
  baseEur: z.number(),
  vatEur: z.number(),
  totalEur: z.number(),
  lineConcept: z.string(), // a BudgetLine.concept of artist-pro.json
});
export const JustificationFile = z.object({
  invoices: z.array(InvoiceReading.extend({ image: z.string().regex(/^[\w.-]+\.png$/) })).min(1),
  sample: InvoiceReading.extend({ image: z.string().regex(/^[\w.-]+\.png$/) }),
});
export type JustificationFile = z.infer<typeof JustificationFile>;

/** The B2B panel demo (IDEA #8): an organisation whose members already accepted. Their profiles are fictional and owned by synthetic ids. */
export const OrgFile = z.object({
  org: z.object({ name: z.string(), kind: z.enum(["school", "association"]) }),
  members: z
    .array(z.object({ email: z.string().email(), profile: ScenarioProfile, dossier: z.array(ScenarioSection).min(1) }))
    .min(2)
    .max(4),
});
export type OrgFile = z.infer<typeof OrgFile>;

export const SCENARIO_FILES = { artist: "artist.json", pro: "artist-pro.json", business: "business.json", justification: "justification.json", org: "org.json" } as const;

function readJsonFile(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(demoDataDir(), file), "utf8"));
}

export function loadArtist(): PersonaFile {
  return PersonaFile.parse(readJsonFile(SCENARIO_FILES.artist));
}
export function loadBusiness(): PersonaFile {
  return PersonaFile.parse(readJsonFile(SCENARIO_FILES.business));
}
export function loadPro(): ProFile {
  return ProFile.parse(readJsonFile(SCENARIO_FILES.pro));
}

export function loadJustification(): JustificationFile {
  return JustificationFile.parse(readJsonFile(SCENARIO_FILES.justification));
}
export function loadOrg(): OrgFile {
  return OrgFile.parse(readJsonFile(SCENARIO_FILES.org));
}

export function workImagePath(image: string): string {
  return path.join(demoDataDir(), "works", image);
}
export function invoiceImagePath(image: string): string {
  return path.join(demoDataDir(), "invoices", image);
}
/** The invoice photo the presenter takes live: served statically so the phone can save it (see ./sample-invoice). */
export function sampleInvoicePath(): string {
  return path.resolve(process.cwd(), "public", SAMPLE_INVOICE_URL.slice(1));
}

/** The call the Pro application is for: the first listed one that exists and is open (fixtures in tests). */
export function pickProCall(pro: ProFile, calls: readonly Call[]): Call | undefined {
  const open = (c: Call) => c.status === "open" && c.beneficiaryKinds.includes("creator");
  for (const id of pro.callIds) {
    const c = calls.find((x) => x.id === id);
    if (c && open(c)) return c;
  }
  // The curated catalogue changed under us: any open creator call with published criteria, else any open creator call.
  return calls.find((c) => open(c) && c.criteriaSource === "bases" && c.criteria.length > 0) ?? calls.find(open);
}

/** The two end-to-end extras the Pro/blank scenarios leave ready: invoices for /justificacion and the organisation for /panel. */
export interface ExtraCheck {
  id: "justification" | "panel";
  ok: boolean;
  problems: string[];
}

export function checkExtras(): ExtraCheck[] {
  const run = (id: ExtraCheck["id"], fn: () => string[]): ExtraCheck => {
    try {
      const problems = fn();
      return { id, ok: problems.length === 0, problems };
    } catch (e) {
      return { id, ok: false, problems: [e instanceof Error ? e.message.slice(0, 300) : String(e)] };
    }
  };
  return [
    run("justification", () => {
      const j = loadJustification();
      const lines = new Set(loadPro().application.budget.map((l) => l.concept));
      return [
        ...[...j.invoices, j.sample].filter((i) => !lines.has(i.lineConcept)).map((i) => `La factura ${i.number} apunta a una partida que no existe: ${i.lineConcept}`),
        ...j.invoices.filter((i) => !fs.existsSync(invoiceImagePath(i.image))).map((i) => `Falta la imagen ${i.image}`),
        ...(fs.existsSync(sampleInvoicePath()) ? [] : [`Falta la foto de ejemplo ${SAMPLE_INVOICE_URL}`]),
      ];
    }),
    run("panel", () => (loadOrg().members.length >= 2 ? [] : ["La organización de ejemplo necesita al menos 2 miembros"])),
  ];
}

export interface ScenarioCheck {
  scenario: DemoScenarioId;
  ok: boolean;
  problems: string[];
  /** For "pro": the call its application is for. */
  callId?: string;
}

/** Validate what a scenario needs without loading it (harmless: used by /demo and npm run demo:preflight). */
export function checkScenarios(calls: readonly Call[]): ScenarioCheck[] {
  const out: ScenarioCheck[] = [{ scenario: "blank", ok: true, problems: [] }];
  const persona = (scenario: DemoScenarioId, load: () => PersonaFile): PersonaFile | undefined => {
    try {
      const p = load();
      const missing = p.works.filter((w) => !fs.existsSync(workImagePath(w.image))).map((w) => `Falta la imagen ${w.image}`);
      out.push({ scenario, ok: missing.length === 0, problems: missing });
      return p;
    } catch (e) {
      out.push({ scenario, ok: false, problems: [e instanceof Error ? e.message.slice(0, 300) : String(e)] });
      return undefined;
    }
  };
  const artist = persona("onboarded", loadArtist);
  persona("business", loadBusiness);
  try {
    const pro = loadPro();
    const call = pickProCall(pro, calls);
    const problems = [...(artist ? [] : ["El escenario del artista no carga"]), ...(call ? [] : ["No hay ninguna convocatoria abierta para artistas"])];
    out.push({ scenario: "pro", ok: problems.length === 0, problems, ...(call ? { callId: call.id } : {}) });
  } catch (e) {
    out.push({ scenario: "pro", ok: false, problems: [e instanceof Error ? e.message.slice(0, 300) : String(e)] });
  }
  return out;
}
