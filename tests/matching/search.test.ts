import { describe, expect, it } from "vitest";
import { fixtureCalls } from "@/fixtures";
import { matchesQuery, queryTokens } from "@/features/matching/search";
import type { Call } from "@/contracts";

const base = fixtureCalls[0]!;
const mk = (p: Partial<Call>): Call => ({ ...base, ...p });

describe("call text search", () => {
  const dep = mk({ title: "Bolsas de perfeccionamiento artístico", organizer: "Deputación da Coruña", summary: "Ayudas para artistas visuales de la provincia", region: "A Coruña", disciplines: ["pintura"] });
  it("ignores accents and case, and Galician ↔ Spanish synonyms meet", () => {
    expect(matchesQuery(dep, "diputación")).toBe(true);
    expect(matchesQuery(dep, "DIPUTACION")).toBe(true);
    expect(matchesQuery(mk({ organizer: "Diputación de Lugo" }), "deputación")).toBe(true);
    expect(matchesQuery(mk({ organizer: "Concello de Vigo" }), "ayuntamiento")).toBe(true);
  });
  it("needs every meaningful word, in any order, and ignores stop words", () => {
    expect(queryTokens("Becas en la Deputación")).toEqual(["becas", "deputacion"]);
    expect(matchesQuery(dep, "bolsas diputación coruña")).toBe(true);
    expect(matchesQuery(dep, "bolsas diputación lugo")).toBe(false);
  });
  it("matches the territory and the discipline family", () => {
    expect(matchesQuery(dep, "galicia")).toBe(true);
    expect(matchesQuery(dep, "artes plásticas")).toBe(true);
    expect(matchesQuery(dep, "poesía")).toBe(false);
  });
  it("an empty query matches everything", () => {
    expect(matchesQuery(dep, "")).toBe(true);
    expect(matchesQuery(dep, undefined)).toBe(true);
  });
});
