import { describe, expect, it } from "vitest";
import { fixtureBusiness, fixtureCalls, fixtureCreator, FIXTURE_NOW } from "@/fixtures";
import { parseAgeRange, parseMinEmployees, evaluateEligibility, normalizeCall, normalizeProfile } from "@/features/normalize";
import { bySpecificity, evaluate } from "@/features/matching/rules";
import type { Call } from "@/contracts";

const now = new Date(FIXTURE_NOW);
const beca = fixtureCalls[0]!;
const mk = (p: Partial<Call>): Call => ({ ...beca, status: "open", deadline: "2027-03-01", ...p });

describe("eligibility parsing", () => {
  it("'al menos 5 años de actividad' is not an age range", () => {
    expect(parseAgeRange("Al menos 5 años de actividad profesional")).toEqual({});
    expect(parseAgeRange("Antigüedad mínima de 2 años")).toEqual({});
    expect(parseAgeRange("Tener entre 18 y 35 años cumplidos")).toMatchObject({ min: 18, max: 35 });
    expect(parseAgeRange("Menores de 35 años")).toMatchObject({ max: 34 });
  });
  it("reads a minimum of workers", () => {
    expect(parseMinEmployees("Mínimo 3 personas trabajadoras en 2025")).toBe(3);
    expect(parseMinEmployees("Tener al menos 5 trabajadores")).toBe(5);
    expect(parseMinEmployees("Hasta 10 trabajadores")).toBeUndefined();
  });
  it("a one-employee business fails a 3-worker minimum; one with 5 passes", () => {
    const c = mk({ beneficiaryKinds: ["business"], eligibility: { ...beca.eligibility, residence: [], minAge: undefined, maxAge: undefined, minEmployees: 3 } });
    const one = evaluate({ ...fixtureBusiness, employees: 1 }, c, { now });
    const five = evaluate({ ...fixtureBusiness, employees: 5 }, c, { now });
    expect(one.match.eligible).toBe(false);
    expect(five.match.eligible).toBe(true);
  });
});

describe("territory", () => {
  it("an autonomic call is not 'ámbito estatal'; a state one is", () => {
    const galicia = mk({ scope: "autonomico", region: "Galicia", territories: [], eligibility: { ...beca.eligibility, residence: [] } });
    const spain = mk({ scope: "estatal", region: undefined, territories: [], eligibility: { ...beca.eligibility, residence: [] } });
    const reasons = (c: Call) => evaluate(fixtureCreator, c, { now }).match.whyYouFit.join(" | ");
    expect(reasons(spain)).toMatch(/toda España|estatal/i);
    expect(reasons(galicia)).not.toMatch(/estatal/i);
    const miss = evaluate({ ...fixtureCreator, region: "Cataluña", province: "Barcelona", city: "Barcelona" }, galicia, { now }).match;
    expect(miss.whatYouMiss.join(" ")).toMatch(/Galicia/);
  });
});

describe("why you fit", () => {
  it("specific reasons come before generic passes", () => {
    const out = bySpecificity(["Eres del tipo de beneficiario que busca", "Está abierta a toda España", "Encaja con tu disciplina: pintura", "Es de tu zona (A Coruña)"]);
    expect(out[0]).toMatch(/^Encaja con/);
    expect(out[1]).toMatch(/^Es de tu/);
    expect(out.slice(-2).join(" ")).toMatch(/beneficiario|España/);
  });
  it("age: no second 'Confírmalo' when the birth year already decided it", () => {
    const c = mk({ eligibility: { ...beca.eligibility, minAge: 18, maxAge: 35, other: ["Tener entre 18 y 35 años cumplidos"] } as Call["eligibility"] });
    const m = evaluate({ ...fixtureCreator, birthYear: 1998 }, c, { now }).match;
    expect(m.whatYouMiss.filter((w) => /18 y 35/.test(w))).toEqual([]);
  });
});

describe("ranking signals", () => {
  const near = mk({ id: "t-near", region: "Galicia", territories: ["ES11"], amountEur: { max: 3000 }, amountText: "Premio de 3.000 €" });
  const far = mk({ id: "t-far", region: "Andalucía", territories: [], eligibility: { ...beca.eligibility, residence: [] }, amountEur: { max: 3000 }, amountText: "Premio de 3.000 €" });
  const noCash = mk({ id: "t-nocash", region: "Galicia", territories: ["ES11"], amountEur: {}, amountText: "Sin dotación económica: exposición" });
  const fee = mk({ id: "t-fee", region: "Galicia", territories: ["ES11"], amountEur: { max: 3000 }, amountText: "Premio de 3.000 €. Cuota de inscripción: 30 €" });
  const score = (c: Call) => evaluate(fixtureCreator, c, { now }).match.score;
  it("same-territory beats far; cash beats no cash; an entry fee costs points", () => {
    expect(score(near)).toBeGreaterThan(score(far));
    expect(score(near)).toBeGreaterThan(score(noCash));
    expect(score(near)).toBeGreaterThan(score(fee));
  });
  it("a closed edition scores below the same call open", () => {
    expect(score(near)).toBeGreaterThan(score({ ...near, status: "recurring" as const, deadline: undefined as unknown as string }));
  });
});
