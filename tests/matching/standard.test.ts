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
});
