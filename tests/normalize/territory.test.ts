import { canonicalTerritory, ccaaOf, extractTerritories, isWithin, normalizeTerritory, territoryCheck, territoryName } from "@/features/normalize";

const id = (x: string | number, prefer?: "broadest" | "narrowest") => normalizeTerritory(x, prefer ? { prefer } : {}).id;

describe("normalizeTerritory", () => {
  it.each([
    ["ES11 - GALICIA", "ES11"],
    ["ES11", "ES11"],
    ["es111", "ES111"],
    ["ES - ESPAÑA ", "ES"],
    ["ES212 - Gipuzkoa", "ES212"],
    ["XXXX - TODO EL MUNDO", "WORLD"],
    ["Galicia", "ES11"],
    ["GALIZA", "ES11"],
    ["Comunidad Autónoma de Galicia", "ES11"],
    ["A Coruña", "ES111"],
    ["La Coruña", "ES111"],
    ["Coruña (A)", "ES111"],
    ["Coruña, A", "ES111"],
    ["a coruna", "ES111"],
    ["Orense", "ES113"],
    ["Provincia de Pontevedra", "ES114"],
    ["Deputación de Lugo", "ES112"],
    ["País Vasco", "ES21"],
    ["Euskadi", "ES21"],
    ["Gerona", "ES512"],
    ["Valencia / València", "ES523"],
    ["Illes Balears", "ES53"],
    ["toda España", "ES"],
    ["estatal", "ES"],
  ])("%s → %s", (input, expected) => {
    expect(id(input)).toBe(expected);
  });

  it("reads INE codes: 2 digits = province, 5 digits = municipality", () => {
    expect(id("15")).toBe("ES111");
    expect(id(36)).toBe("ES114");
    expect(id("15030")).toBe("mun:15030");
    expect(id("12", undefined)).toBe("ES522"); // province 12 = Castellón
    expect(normalizeTerritory("12", { ine: "ccaa" }).id).toBe("ES11"); // CCAA 12 = Galicia
  });

  it("resolves Galician municipalities with Galician and Spanish names", () => {
    expect(id("Sanxenxo")).toBe("mun:36051");
    expect(id("Sangenjo")).toBe("mun:36051");
    expect(id("Concello de A Estrada")).toBe("mun:36017");
    expect(id("Estrada (A)")).toBe("mun:36017");
    expect(id("La Estrada")).toBe("mun:36017");
    expect(id("Villagarcía de Arosa")).toBe("mun:36060");
    expect(id("Santiago de Compostela")).toBe("mun:15078");
    expect(id("Malpica de Bergantiños")).toBe("mun:15043");
  });

  it("disambiguates province vs city by preference", () => {
    expect(normalizeTerritory("Lugo").candidates.sort()).toEqual(["ES112", "mun:27028"]);
    expect(id("Lugo", "broadest")).toBe("ES112");
    expect(id("Lugo", "narrowest")).toBe("mun:27028");
    expect(id("Concello de Lugo")).toBe("mun:27028");
  });

  it("tolerates small typos and finds places in sentences", () => {
    expect(id("Pontevedr")).toBe("ES114");
    expect(id("Residentes en Galicia")).toBe("ES11");
    expect(extractTerritories("empadronadas en Galicia o en Asturias").sort()).toEqual(["ES11", "ES12"]);
    // "nacional" inside a name is not a scope
    expect(extractTerritories("Biblioteca Nacional")).toEqual([]);
  });

  it("returns null for unknown input", () => {
    expect(normalizeTerritory("Narnia").id).toBeNull();
    expect(normalizeTerritory("").id).toBeNull();
    expect(normalizeTerritory(null).id).toBeNull();
  });
});

describe("containment", () => {
  it("A Coruña city ⊂ A Coruña province ⊂ Galicia ⊂ España ⊂ world", () => {
    expect(isWithin("mun:15030", "ES111")).toBe(true);
    expect(isWithin("mun:15030", "ES11")).toBe(true);
    expect(isWithin("ES111", "ES11")).toBe(true);
    expect(isWithin("ES111", "ES")).toBe(true);
    expect(isWithin("ES111", "WORLD")).toBe(true);
    expect(isWithin("ES11", "ES111")).toBe(false);
    expect(isWithin("mun:15030", "ES300")).toBe(false);
    expect(isWithin("mun:36057", "ES111")).toBe(false); // Vigo is in Pontevedra
    expect(isWithin(null, "ES11")).toBe(false);
  });

  it("uniprovincial communities are equivalent at both levels", () => {
    expect(canonicalTerritory("ES3")).toBe("ES300");
    expect(isWithin("ES30", "ES300")).toBe(true);
    expect(isWithin("ES300", "ES30")).toBe(true);
    expect(isWithin("ES120", "ES12")).toBe(true);
  });

  it("territoryCheck: empty = state-wide, unknown profile = unknown", () => {
    expect(territoryCheck("mun:15030", [])).toBe("pass");
    expect(territoryCheck("mun:15030", ["ES11"])).toBe("pass");
    expect(territoryCheck("mun:15030", ["ES300", "ES111"])).toBe("pass");
    expect(territoryCheck("mun:15030", ["ES300"])).toBe("fail");
    expect(territoryCheck(null, ["ES11"])).toBe("unknown");
    expect(territoryCheck(null, ["WORLD"])).toBe("pass");
  });

  it("helpers", () => {
    expect(ccaaOf("mun:15030")).toBe("ES11");
    expect(territoryName("ES111")).toBe("A Coruña");
  });
});
