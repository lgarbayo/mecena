import { describe, expect, it } from "vitest";
import type { Call, Profile } from "@/contracts";
import { FIXTURE_NOW, fixtureCalls, fixtureCreator } from "@/fixtures";
import { evaluate } from "@/features/matching/rules";
import { ABROAD, isAbroad, profileTerritory } from "@/features/normalize";

// Residence and intent in the score: a profile abroad, doubtful local calls from another comunidad, and what a
// creator is looking for. Synthetic calls on top of the fixtures so the numbers don't drift with data/calls.
const now = new Date(FIXTURE_NOW);
const fixture = (id: string): Call => structuredClone(fixtureCalls.find((c) => c.id === id)!);
const beca = () => fixture("fixture-beca-artes-plasticas"); // requires living in A Coruña
const premio = () => fixture("fixture-premio-ilustracion"); // private, no area at all

/** A town in another comunidad that says nothing about residence (implicit territory). */
const benidormLike = (): Call => ({ ...beca(), id: "t-local-cv", scope: "local", region: "Comunitat Valenciana", eligibility: { ...beca().eligibility, residence: [], other: [] } }); // no other open requirement: the unconfirmed-requirements cap (unconfirmed.test.ts) stays out of the way
/** The same kind of call, from the creator's own comunidad. */
const galiciaLike = (): Call => ({ ...benidormLike(), id: "t-local-gal", region: "Galicia" });
const spainWide = (): Call => ({ ...beca(), id: "t-es", scope: "estatal", region: undefined, eligibility: { ...beca().eligibility, residence: ["España"] } });
const worldWide = (): Call => ({ ...spainWide(), id: "t-world", scope: "privado", eligibility: { ...beca().eligibility, residence: ["XXXX - TODO EL MUNDO"] } });

const creator = (o: Partial<Profile> = {}): Profile => ({ ...structuredClone(fixtureCreator), birthYear: 1995, ...o });
const abroad = () => creator({ city: "Beijing", province: undefined, region: undefined, territory: undefined });

describe("profiles that live abroad", () => {
  it("recognise foreign places, never Spanish ones", () => {
    expect(isAbroad("Beijing")).toBe(true);
    expect(isAbroad("Pekín (China)")).toBe(true);
    expect(isAbroad("vivo en el extranjero")).toBe(true);
    expect(isAbroad("Santiago")).toBe(false);
    expect(isAbroad("Valencia")).toBe(false);
    expect(profileTerritory({ city: "Beijing" }).value).toBe(ABROAD);
    expect(profileTerritory({ city: "Berlín", region: "Alemania" }).value).toBe(ABROAD);
    expect(profileTerritory({ city: "Santiago de Compostela" }).value).not.toBe(ABROAD);
    expect(profileTerritory({ city: "Pueblo inventado" }).value).toBeNull(); // unknown, not abroad
  });

  it("fail calls for a part of Spain instead of asking where they live", () => {
    const r = evaluate(abroad(), beca(), { now });
    expect(r.match.eligible).toBe(false);
    expect(r.match.whatYouMiss).toContain("Exige residencia o sede en A Coruña");
  });

  it("confirm Spain-wide calls (residents abroad may or may not apply) and lose the doubt points", () => {
    const r = evaluate(abroad(), spainWide(), { now });
    expect(r.match.eligible).toBe(true);
    expect(r.match.whatYouMiss).toContain("Confírmalo: vives fuera de España; revisa si las bases admiten residentes en el extranjero");
    expect(r.breakdown.base).toBe(17);
  });

  it("pass calls open to anyone, at full base", () => {
    const r = evaluate(abroad(), worldWide(), { now });
    expect(r.match.eligible).toBe(true);
    expect(r.breakdown.base).toBe(25);
  });
});

describe("doubtful residence in the score", () => {
  it("a local call from another comunidad loses 8 base points; from your comunidad it keeps them", () => {
    const coruna = creator();
    const far = evaluate(coruna, benidormLike(), { now });
    const home = evaluate(coruna, galiciaLike(), { now });
    expect(far.match.eligible && home.match.eligible).toBe(true);
    expect(far.match.whatYouMiss.join(" ")).toMatch(/Confírmalo: ámbito municipal de Comunitat Valenciana/);
    expect(far.breakdown.base).toBe(17);
    expect(home.breakdown.base).toBe(25);
    expect(home.match.score).toBeGreaterThan(far.match.score);
  });

  it("the same call keeps its points for someone who lives in that comunidad", () => {
    const valencia = creator({ city: "Valencia", province: "Valencia", region: "Comunitat Valenciana", territory: undefined });
    expect(evaluate(valencia, benidormLike(), { now }).breakdown.base).toBe(25);
  });

  it("a call with no known area is not penalised", () => {
    expect(evaluate(creator(), premio(), { now }).breakdown.base).toBe(25);
  });
});

describe("what a creator is looking for", () => {
  const residency = (): Call => ({ ...beca(), id: "t-residencia", type: "residencia", title: "Programa de residencias artísticas", summary: "Estancia de dos meses en un centro de arte." });

  it("adds points and a reason when the call offers it", () => {
    const wants = evaluate(creator({ fundingNeeds: ["una residencia artística fuera de casa"], projectIdea: undefined }), residency(), { now });
    const other = evaluate(creator({ fundingNeeds: ["comprar un ordenador"], projectIdea: undefined }), residency(), { now });
    expect(wants.match.whyYouFit).toContain("Encaja con lo que buscas: residencia");
    expect(other.match.whyYouFit.join(" ")).not.toMatch(/Encaja con lo que buscas/);
    expect(wants.breakdown.affinity - other.breakdown.affinity).toBeGreaterThanOrEqual(4); // + its own words
  });

  it("ordinal «edición» in a title is not publishing", () => {
    const prize: Call = { ...premio(), id: "t-xxx", title: "XXX edición del premio de ilustración", summary: "Premio a la mejor ilustración." };
    const r = evaluate(creator({ fundingNeeds: ["publicar un libro"], projectIdea: undefined }), prize, { now });
    expect(r.match.whyYouFit.join(" ")).not.toMatch(/publicación/);
  });
});
