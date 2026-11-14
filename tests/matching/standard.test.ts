import { describe, expect, it } from "vitest";
import { Call } from "@/contracts";
import { FIXTURE_NOW, fixtureBusiness, fixtureCreator } from "@/fixtures";
import { evaluate, fitLabel } from "@/features/matching/rules";
import { evaluateEligibility, normalizeCall, normalizeProfile } from "@/features/normalize";
import data from "../../data/calls/calls.json";

// Matching on the real dataset must agree with the data standard (fleet/DATA-STANDARD.md).
const now = new Date(FIXTURE_NOW);
const calls = (data as unknown[]).map((x) => Call.parse(x));
const byId = (id: string) => calls.find((c) => c.id === id)!;

describe("matching agrees with evaluateEligibility on data/calls/calls.json", () => {
  for (const [name, profile] of [
    ["creator", fixtureCreator],
    ["business", fixtureBusiness],
  ] as const) {
    it(`${name}: eligible iff the standard says eligible`, () => {
      const p = normalizeProfile(profile).value;
      for (const c of calls) {
        const r = evaluate(profile, c, { now });
        if (r.excluded) continue;
        const std = evaluateEligibility(p, normalizeCall(c).value, { today: "2026-11-13" });
        expect(r.match.eligible, c.id).toBe(std.eligible);
      }
    });
  }

  it("a state-wide call (residence «España») does not exclude a Galician artist", () => {
    expect(evaluate(fixtureCreator, byId("getxo-novela-corta-ramiro-pinilla-2027"), { now }).match.whatYouMiss.join(" ")).not.toMatch(/residencia/);
  });

  it("an autónoma enters calls open to autónomos even when they target creators", () => {
    expect(evaluate(fixtureBusiness, byId("lasalita-gijon-el-paisaje-2026"), { now }).match.eligible).toBe(true);
  });

  it("an artist without legal form is out of autónomo/pyme-only aid", () => {
    expect(evaluate(fixtureCreator, byId("xunta-promocion-empleo-autonomo-tr341d-2026"), { now }).match.eligible).toBe(false);
  });

  it("CNAE sector rules apply to businesses", () => {
    expect(evaluate(fixtureBusiness, byId("icaa-cortometrajes-realizados-2027"), { now }).match.eligible).toBe(false);
  });

  it("an illustrator ranks her disciplines above unrelated ones", () => {
    const score = (id: string) => evaluate(fixtureCreator, byId(id), { now }).match.score;
    const mine = ["cromawards-2026", "arte-intruso-sierra-norte-2027", "lasalita-gijon-el-paisaje-2026"].map(score);
    const other = ["fornelos-premio-poesia-lueiro-rey-2026", "cabra-premio-novela-juan-valera-2027", "sant-joan-festival-cine-cortometrajes-2027"].map(score);
    expect(Math.min(...mine)).toBeGreaterThan(Math.max(...other));
    for (const s of other) expect(fitLabel(s)).toBe("bajo");
  });

  it("differentiates business calls by sector, territory, legal form and funding needs instead of returning the same list for every pyme", () => {
    const rankFor = (p: typeof fixtureBusiness) =>
      calls
        .map((c) => ({ c, r: evaluate(p, c, { now }) }))
        .filter(({ c, r }) => !r.excluded && r.match.eligible && (c.beneficiaryKinds.includes("business") || r.match.score >= 60))
        .sort((a, b) => b.r.match.score - a.r.match.score)
        .slice(0, 3)
        .map(({ c }) => c.id);

    // 1. Galician restaurant SL seeking energy efficiency
    const restaurantGalicia = {
      ...fixtureBusiness,
      displayName: "Restaurante O Porto",
      city: "Santiago de Compostela",
      province: "A Coruña",
      region: "Galicia",
      territory: undefined,
      legalForm: "sl" as const,
      beneficiaryTypes: [],
      cnae: undefined,
      sector: "hostelería",
      employees: 6,
      fundingNeeds: ["eficiencia energética", "placas solares"],
      projectIdea: "Instalar placas solares y aerotermia en el restaurante.",
    };
    // 2. Valencian audiovisual production SL seeking film production aid
    const audiovisualValencia = {
      ...fixtureBusiness,
      displayName: "Llum Films S.L.",
      city: "Valencia",
      province: "Valencia",
      region: "Comunitat Valenciana",
      territory: undefined,
      legalForm: "sl" as const,
      beneficiaryTypes: [],
      cnae: undefined,
      sector: "audiovisual",
      employees: 5,
      fundingNeeds: ["producción de cortometraje", "distribución en festivales"],
      projectIdea: "Producir un cortometraje de ficción y distribuirlo en festivales.",
    };
    // 3. Galician ceramics autónomo (fixtureBusiness)
    const topCeramics = rankFor(fixtureBusiness);
    const topRestaurant = rankFor(restaurantGalicia);
    const topAudiovisual = rankFor(audiovisualValencia);

    expect(topRestaurant[0]).toBe("turismo-galicia-eficiencia-energetica-tu986b-2026");
    expect(topCeramics).not.toContain("turismo-galicia-eficiencia-energetica-tu986b-2026");
    expect(topAudiovisual).toContain("icaa-cortometrajes-realizados-2027");
    expect(topAudiovisual).not.toContain("igape-re-acciona-2026");
    expect(topCeramics).not.toEqual(topRestaurant);
    expect(topCeramics).not.toEqual(topAudiovisual);
  });
});
