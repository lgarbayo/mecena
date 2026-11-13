import { describe, expect, it } from "vitest";
import { BusinessSectionKey, CreatorSectionKey, type DossierSection, type Profile, type TranscriptSegment } from "@/contracts";
import { blankCreator, fixtureBusiness, fixtureTranscript, FIXTURE_NOW } from "@/fixtures";
import { mockOnboardingTurn, classifySentence, extractProfilePatch } from "@/features/onboarding/mock";
import { mergeProfile } from "@/server/store";

/** Run segments through the mock the way the service does (merge profile, replace sections by key). */
function runAll(start: Profile, segments: TranscriptSegment[]) {
  let profile = structuredClone(start);
  const sections = new Map<string, DossierSection>();
  const transcript: TranscriptSegment[] = [];
  for (const seg of segments) {
    transcript.push(seg);
    const r = mockOnboardingTurn({ kind: profile.kind, profile, sections: [...sections.values()], transcript, newSegment: seg });
    profile = mergeProfile(profile, r.profilePatch);
    for (const s of r.sectionUpdates) sections.set(s.key, s);
  }
  return { profile, sections: [...sections.values()] };
}

const seg = (id: string, text: string): TranscriptSegment => ({ id, text, source: "voice", at: FIXTURE_NOW });

describe("onboarding mock extraction (creator)", () => {
  it("the 3 fixture segments build Antía's profile and ≥ 3 creator sections", () => {
    const { profile, sections } = runAll(blankCreator, fixtureTranscript);
    expect(profile.displayName).toBe("Antía Varela");
    expect(profile.city).toBe("A Coruña");
    expect(profile.region).toBe("Galicia");
    expect(profile.disciplines).toContain("ilustración");
    expect(profile.disciplines).toContain("pintura");
    expect(profile.projectIdea).toMatch(/doce acuarelas/);
    expect(profile.fundingNeeds.join(" ")).toMatch(/fanzine/);
    expect(sections.length).toBeGreaterThanOrEqual(3);
    for (const s of sections) expect(CreatorSectionKey.options).toContain(s.key);
    const keys = sections.map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["bio", "statement", "series"]));
  });

  it("keeps the user's words verbatim and grounds every section in segment ids", () => {
    const { sections } = runAll(blankCreator, fixtureTranscript);
    const statement = sections.find((s) => s.key === "statement")!;
    expect(statement.body).toContain("Pinto a las rederas y mariscadoras de mi familia");
    expect(statement.sourceSegmentIds).toEqual(["seg-2"]);
    for (const s of sections) expect(s.sourceSegmentIds.length).toBeGreaterThan(0);
  });

  it("a later place mention does not overwrite the city; an explicit move does", () => {
    const { profile } = runAll(blankCreator, [...fixtureTranscript, seg("seg-4", "Expuse en Vigo en 2024.")]);
    expect(profile.city).toBe("A Coruña");
    expect(profile.achievements[0]).toMatch(/Expuse en Vigo/);
    const moved = runAll(profile, [seg("seg-5", "Ahora vivo en Santiago de Compostela.")]);
    expect(moved.profile.city).toBe("Santiago de Compostela");
  });

  it("supports corrections of the name", () => {
    const { profile } = runAll(blankCreator, [seg("a", "Me llamo Antia Barela."), seg("b", "Perdón, me llamo Antía Varela.")]);
    expect(profile.displayName).toBe("Antía Varela");
  });

  it("extracts education, achievements, languages, links and birth year", () => {
    const p = extractProfilePatch(
      "Nací en 1994. Estudié Bellas Artes en Pontevedra. Fui finalista del Certamen de Ilustración de Ourense. Hablo gallego, castellano e inglés. Mi Instagram es @antiavarela.",
      "creator",
      blankCreator,
    );
    expect(p.birthYear).toBe(1994);
    expect(p.education?.[0]).toMatch(/^Estudié Bellas Artes/);
    expect(p.achievements?.[0]).toMatch(/finalista/);
    expect(p.languages).toEqual(["gallego", "castellano", "inglés"]);
    expect(p.links).toContain("@antiavarela");
  });

  it("routes a sentence to exactly one creator section", () => {
    expect(classifySentence("Expuse en el Kiosko Alfonso en 2024.", "creator")).toEqual(["cv"]);
    expect(classifySentence("Mi web es antiavarela.gal", "creator")).toEqual(["contact"]);
    expect(classifySentence("Mmm, bueno.", "creator")).toEqual(["statement"]);
  });

  it("asks a follow-up about what is still missing", () => {
    const first = mockOnboardingTurn({ kind: "creator", profile: blankCreator, sections: [], transcript: [fixtureTranscript[0]], newSegment: fixtureTranscript[0] });
    expect(first.followUpQuestion).toMatch(/proyecto/);
  });
});

describe("onboarding mock extraction (business)", () => {
  const blankBusiness: Profile = { ...fixtureBusiness, displayName: "", city: undefined, province: undefined, region: undefined, sector: undefined, employees: undefined, foundedYear: undefined, annualRevenueEur: undefined, legalForm: undefined, achievements: [], fundingNeeds: [], projectIdea: undefined };

  it("a business sentence produces business keys only", () => {
    const { profile, sections } = runAll(blankBusiness, [
      seg("b1", "Mi taller se llama Cerámica Mareira, hacemos cerámica artesanal en Lugo desde 2019 y somos dos personas."),
      seg("b2", "Facturamos unos 48.000 euros al año. Queremos montar una tienda online y contratar a una ayudante."),
    ]);
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) expect(BusinessSectionKey.options).toContain(s.key);
    for (const s of sections) expect(CreatorSectionKey.options).not.toContain(s.key);
    expect(profile.displayName).toBe("Cerámica Mareira");
    expect(profile.city).toBe("Lugo");
    expect(profile.sector).toBe("artesanía / cerámica");
    expect(profile.foundedYear).toBe(2019);
    expect(profile.employees).toBe(2);
    expect(profile.annualRevenueEur).toBe(48000);
    expect(profile.fundingNeeds.join(" ")).toMatch(/tienda online/);
    expect(sections.map((s) => s.key)).toEqual(expect.arrayContaining(["activity", "team", "figures", "projects", "location"]));
  });
});

describe("pyme follow-up questions", () => {
  it("asks for what decides eligibility (activity, place, legal form, size) before money and pride", async () => {
    const { followUpFor } = await import("@/features/onboarding/mock");
    const base = { ...fixtureBusiness, legalForm: undefined, employees: undefined, foundedYear: undefined, annualRevenueEur: undefined, fundingNeeds: [], projectIdea: undefined };
    expect(followUpFor("business", base)).toMatch(/autónomo\/a o tenéis una sociedad/);
    expect(followUpFor("business", { ...base, legalForm: "autonomo" })).toMatch(/Cuántas personas/);
    expect(followUpFor("business", { ...base, legalForm: "autonomo", employees: 2 })).toMatch(/financiar/);
    expect(followUpFor("business", { ...base, legalForm: "autonomo", employees: 2, fundingNeeds: ["tienda online"] })).toMatch(/Desde qué año/);
  });
});

describe("pyme fallback extraction of short answers", () => {
  const p = { ...fixtureBusiness, legalForm: "autonomo" as const, employees: undefined, foundedYear: undefined };
  it("reads bare answers to the follow-up questions", () => {
    expect(extractProfilePatch("Somos tres.", "business", p).employees).toBe(3);
    expect(extractProfilePatch("5 contándome", "business", p).employees).toBe(5);
    expect(extractProfilePatch("Desde 2019", "business", p).foundedYear).toBe(2019);
    expect(extractProfilePatch("Es una sociedad anónima", "business", { ...p, legalForm: undefined }).legalForm).toBe("sa");
    expect(extractProfilePatch("Somos una comunidad de bienes", "business", { ...p, legalForm: undefined }).legalForm).toBe("otra");
  });
  it("does not mistake what they want to finance for a headcount", () => {
    expect(extractProfilePatch("Una tienda online", "business", p).employees).toBeUndefined();
    expect(extractProfilePatch("Dos hornos nuevos", "business", p).employees).toBeUndefined();
  });
});
