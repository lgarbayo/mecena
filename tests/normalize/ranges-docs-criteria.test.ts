import {
  ageCheck,
  ageRangeAt,
  largestRemainder,
  missingDocuments,
  normalizeCriteria,
  normalizeDocuments,
  parseAgeRange,
  parseMinRevenue,
  parseYearsActive,
  yearsActiveCheck,
} from "@/features/normalize";

describe("age rules", () => {
  it.each([
    ["Personas de entre 18 y 35 años", { min: 18, max: 35 }],
    ["menores de 35 años", { max: 34 }],
    ["no haber cumplido 36 años a la fecha de fin de plazo", { max: 35 }],
    ["hasta 30 años", { max: 30 }],
    ["Ser mayor de edad", { min: 18 }],
    ["mayores de 18 años", { min: 18 }],
    ["persoas maiores de idade", { min: 18 }],
    ["artistas nacidos a partir del 1 de enero de 1991", { birthYearMin: 1991 }],
    ["nacidas antes de 1990", { birthYearMax: 1989 }],
    ["Sin requisitos de edad", {}],
  ])("%s", (text, rule) => expect(parseAgeRange(text)).toEqual(rule));

  it("birth year only gives a two-value age; the edge is unknown", () => {
    expect(ageRangeAt(1994, "2026-12-05")).toEqual({ min: 31, max: 32 });
    expect(ageCheck(1994, { min: 18, max: 35 }, "2026-12-05")).toBe("pass");
    expect(ageCheck(1986, { max: 35 }, "2026-12-05")).toBe("fail"); // 39–40
    expect(ageCheck(1991, { max: 35 }, "2026-12-05")).toBe("pass"); // 34 or 35
    expect(ageCheck(1990, { max: 35 }, "2026-12-05")).toBe("unknown"); // 35 or 36
    expect(ageCheck(undefined, { max: 35 }, "2026-12-05")).toBe("unknown");
    expect(ageCheck(undefined, {}, "2026-12-05")).toBe("pass");
    expect(ageCheck(1990, { birthYearMin: 1991 }, "2026-12-05")).toBe("fail");
  });

  it("years active", () => {
    expect(parseYearsActive("con al menos 2 años de actividad")).toEqual({ min: 2 });
    expect(parseYearsActive("empresas constituidas en los últimos 3 años")).toEqual({ max: 3 });
    expect(parseYearsActive("entre 1 y 5 años de antigüedad")).toEqual({ min: 1, max: 5 });
    expect(yearsActiveCheck(2019, { min: 2 }, "2026-11-13")).toBe("pass");
    expect(yearsActiveCheck(2019, { max: 3 }, "2026-11-13")).toBe("fail");
    expect(yearsActiveCheck(undefined, { max: 3 }, "2026-11-13")).toBe("unknown");
  });
});

describe("documents", () => {
  it("maps one line to several canonical documents", () => {
    const r = normalizeDocuments([
      "Certificados de estar al corriente con Hacienda y la Seguridad Social",
      "Dossier artístico (máx. 10 imágenes, PDF)",
      "Presupuesto desglosado del proyecto",
      "Memoria descriptiva del proyecto",
      "Fotocopia del DNI o NIE",
      "Declaración responsable de otras ayudas (Anexo II)",
      "Currículum vitae",
      "Certificado de non ter débedas coa Facenda galega (ATRIGA)",
      "Alta en el RETA",
      "Algo raro que nadie pide",
    ]);
    expect(r.ids).toEqual([
      "certificado-hacienda",
      "certificado-seguridad-social",
      "dossier",
      "presupuesto",
      "memoria",
      "dni",
      "declaracion-responsable",
      "cv",
      "certificado-atriga",
      "alta-autonomo",
    ]);
    expect(r.unmapped).toEqual(["Algo raro que nadie pide"]);
  });

  it("synonyms in es/gl and typos", () => {
    expect(normalizeDocuments(["Portafolio"]).ids).toEqual(["dossier"]);
    expect(normalizeDocuments(["orzamento"]).ids).toEqual(["presupuesto"]);
    expect(normalizeDocuments(["curriculo"]).ids).toEqual(["cv"]);
    expect(normalizeDocuments(["presupusto"]).ids).toEqual(["presupuesto"]);
    expect(missingDocuments(["memoria", "dossier", "dni"], ["dni"])).toEqual(["memoria", "dossier"]);
  });
});

describe("criteria", () => {
  it("keeps 100-point scales and has no sum warning", () => {
    const r = normalizeCriteria([
      { id: "a", name: "Calidad", description: "", maxPoints: 40 },
      { id: "b", name: "Viabilidad", description: "", maxPoints: 40 },
      { id: "c", name: "Territorio", description: "", maxPoints: 20 },
    ]);
    expect(r.criteria.map((c) => c.weightPct)).toEqual([40, 40, 20]);
    expect(r.warnings).toEqual([]);
  });

  it("rescales other totals to integer weights summing to exactly 100", () => {
    const r = normalizeCriteria([
      { id: "a", name: "A", description: "", maxPoints: 10 },
      { id: "b", name: "B", description: "", maxPoints: 10 },
      { id: "c", name: "C", description: "", maxPoints: 10 },
    ]);
    expect(r.criteria.map((c) => c.weightPct)).toEqual([34, 33, 33]);
    expect(r.totalPoints).toBe(30);
    expect(r.warnings.map((w) => w.code)).toEqual(["criteria-sum"]);
    const sixty = normalizeCriteria([
      { id: "x", name: "X", description: "", maxPoints: 35 },
      { id: "y", name: "Y", description: "", maxPoints: 25 },
    ]);
    expect(sixty.criteria.map((c) => c.weightPct)).toEqual([58, 42]);
  });

  it("flags invalid and empty criteria", () => {
    expect(normalizeCriteria([]).warnings[0].code).toBe("criteria-empty");
    const bad = normalizeCriteria([
      { id: "a", name: "A", description: "", maxPoints: 0 },
      { id: "a", name: "B", description: "", maxPoints: 50 },
    ]);
    expect(bad.warnings.map((w) => w.code)).toEqual(["criteria-invalid", "criteria-invalid", "criteria-sum"]);
    expect(bad.criteria.map((c) => c.weightPct)).toEqual([0, 100]);
  });

  it("largestRemainder always sums to the total", () => {
    for (const vals of [[1, 1, 1], [33, 33, 34], [7, 13, 29, 51], [1, 2, 3, 4, 5, 6, 7]]) expect(largestRemainder(vals).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("parseMinRevenue", () => {
  it.each([
    ["Facturación mínima de 100.000 € en la última anualidad", 100000],
    ["Rendimiento neto reducido (IRPF 2024) inferior a 50.000 € y facturación anual de al menos 12.000 €", 12000],
    ["Facturación superior a 50.000 euros", 50000],
    ["volumen de negocio mínimo de 300.000 €", 300000],
  ])("%s → %s", (text, n) => expect(parseMinRevenue(text)).toBe(n));

  it.each(["Facturación inferior a 2 millones de euros", "Rendimiento neto inferior a 50.000 €", "Ayuda de hasta 12.000 €", ""])("%s → no minimum", (text) =>
    expect(parseMinRevenue(text)).toBeUndefined(),
  );
});
