/**
 * Demo scenarios (plan B): ready-made accounts loaded from data/demo/*.json into the signed-in account only.
 * Server-only. The files are validated with the domain contracts here and in tests/demo/scenarios.test.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ApplicationSection, BudgetLine, Call, DossierSection, Profile, TechnicalSheet, TranscriptSegment } from "@/contracts";
import { DemoScenario } from "@/contracts/api";

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

export const SCENARIO_FILES = { artist: "artist.json", pro: "artist-pro.json", business: "business.json" } as const;

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

export function workImagePath(image: string): string {
  return path.join(demoDataDir(), "works", image);
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
