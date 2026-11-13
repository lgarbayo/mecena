import {
  addBusinessDays,
  addMonths,
  formatCents,
  parseAmount,
  parseAmountRange,
  parseDeadlineText,
  parseNumberWord,
  parseSpanishNumber,
  resolveDeadline,
} from "@/features/normalize";

describe("money", () => {
  it.each([
    ["12.000", 12000],
    ["12.000,50", 12000.5],
    ["1.500", 1500],
    ["1,5", 1.5],
    ["12,000", 12000],
    ["1.234.567", 1234567],
    ["12 000", 12000],
    ["12.5", 12.5],
  ])("parseSpanishNumber(%s) = %d", (t, n) => expect(parseSpanishNumber(t)).toBe(n));

  it.each([
    ["Hasta 12.000 €", 1_200_000],
    ["12.000,50 €", 1_200_050],
    ["3000€", 300_000],
    ["3.000 EUR", 300_000],
    ["Premio de 1.500 euros", 150_000],
    ["1,5 millones de euros", 150_000_000],
    ["300 mil euros", 30_000_000],
    ["€ 2.500", 250_000],
    ["Consultar bases", null],
  ])("parseAmount(%s) = %s cents", (t, c) => expect(parseAmount(t)).toBe(c));

  it("numbers (BDNS presupuestoTotal) are euros", () => {
    expect(parseAmount(10000)).toBe(1_000_000);
    expect(parseAmount(31000.5)).toBe(3_100_050);
    expect(parseAmount(null)).toBeNull();
  });

  it("does not glue a year to an amount", () => {
    expect(parseAmount("Convocatoria 2026 300 €")).toBe(30_000);
  });

  it("parses ranges, caps and totals per clause", () => {
    expect(parseAmountRange("Hasta 6.000 € por proyecto")).toEqual({ maxCents: 600_000 });
    expect(parseAmountRange("entre 3.000 y 6.000 euros")).toEqual({ minCents: 300_000, maxCents: 600_000 });
    expect(parseAmountRange("de 1.000 € a 2.000 €")).toEqual({ minCents: 100_000, maxCents: 200_000 });
    expect(parseAmountRange("Premio único de 3.000 €")).toEqual({ minCents: 300_000, maxCents: 300_000 });
    expect(parseAmountRange("Desde 500 €")).toEqual({ minCents: 50_000 });
    expect(parseAmountRange("Dotación total de 30.000 euros. Hasta 6.000 € por proyecto")).toEqual({ totalCents: 3_000_000, maxCents: 600_000 });
    expect(parseAmountRange("Crédito: 1,5 millones de euros; hasta 12.000 € por beneficiario")).toEqual({ totalCents: 150_000_000, maxCents: 1_200_000 });
    expect(parseAmountRange("Consultar bases")).toEqual({});
  });

  it("formats cents in es-ES", () => {
    expect(formatCents(1_200_000)).toBe("12.000 €");
    expect(formatCents(1_200_050)).toBe("12.000,50 €");
  });
});

describe("business-day calendar (Ley 39/2015 art. 30)", () => {
  it("skips weekends, national and Galician holidays", () => {
    // Fri 4 Dec 2026 + 1 → Mon 7; + 2 → Wed 9 (8 Dec Inmaculada)
    expect(addBusinessDays("2026-12-04", 1)).toBe("2026-12-07");
    expect(addBusinessDays("2026-12-04", 2)).toBe("2026-12-09");
    // 24 Jun is a holiday only in Galicia
    expect(addBusinessDays("2026-06-23", 1)).toBe("2026-06-24");
    expect(addBusinessDays("2026-06-23", 1, ["ES11"])).toBe("2026-06-25");
    // Christmas into 2027: 25 Dec, 1 Jan, 6 Jan
    expect(addBusinessDays("2026-12-23", 5)).toBe("2026-12-31");
    expect(addBusinessDays("2026-12-31", 2)).toBe("2027-01-05");
    expect(addBusinessDays("2027-01-05", 1)).toBe("2027-01-07");
  });

  it("months end on the same day number, clamped to month end", () => {
    expect(addMonths("2026-11-13", 1)).toBe("2026-12-13");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
  });

  it("reads Spanish and Galician number words", () => {
    expect(parseNumberWord("veinte")).toBe(20);
    expect(parseNumberWord("cuarenta y cinco")).toBe(45);
    expect(parseNumberWord("vinte")).toBe(20);
    expect(parseNumberWord("Diez")).toBe(10);
    expect(parseNumberWord("algunos")).toBeNull();
  });
});

describe("resolveDeadline", () => {
  const pub = "2026-11-13"; // Friday

  it("N días hábiles from publication (real BDNS textFin)", () => {
    const d = resolveDeadline("30 días hábiles desde el día siguiente al de la publicación del presente extracto en el BOG", "2026-06-16");
    expect(d).toMatchObject({ date: "2026-07-28", estimated: true, method: "business-days" });
    expect(resolveDeadline("veinte (20) días hábiles contados a partir del día siguiente al de la publicación en el DOG", pub, { regions: ["ES11"] }).date).toBe("2026-12-14");
    expect(resolveDeadline("El plazo será de 30 días hábiles desde el día siguiente a la publicación", pub, { regions: ["ES11"] }).date).toBe("2026-12-29");
    expect(resolveDeadline("vinte días hábiles desde a publicación no DOG", pub, { regions: ["ES11"] }).date).toBe("2026-12-14");
  });

  it("días naturales and meses move to the next día hábil", () => {
    expect(resolveDeadline("quince días naturales desde la publicación", pub).date).toBe("2026-11-30"); // 28 Nov is Saturday
    expect(resolveDeadline("un mes desde la publicación en el BOE", pub)).toMatchObject({ date: "2026-12-14", method: "months" }); // 13 Dec Sunday
  });

  it("explicit dates in text, structured field wins", () => {
    expect(resolveDeadline("12/11/2026", pub)).toMatchObject({ date: "2026-11-12", estimated: false, method: "explicit-text" });
    expect(resolveDeadline("20 de septiembre de 2026", null)).toMatchObject({ date: "2026-09-20", estimated: false });
    expect(resolveDeadline("del 1 de octubre al 31 de octubre de 2026", null).date).toBe("2026-10-31");
    expect(resolveDeadline("hasta el 15 de xaneiro", pub)).toMatchObject({ date: "2027-01-15", estimated: true });
    expect(resolveDeadline("10 días hábiles", "2026-11-09", { explicitDate: "2026-11-13" })).toMatchObject({ date: "2026-11-13", estimated: false, method: "explicit-field" });
  });

  it("rolling and unresolvable plazos never invent a date", () => {
    expect(resolveDeadline("SIN PLAZO DE SOLICITUD", pub)).toMatchObject({ date: null, method: "rolling" });
    expect(resolveDeadline("Abierta todo el año hasta agotar crédito", pub).method).toBe("rolling");
    expect(resolveDeadline("Diez días hábiles a la comunicación de inicio", pub)).toMatchObject({ date: null, method: "unresolved" });
    expect(resolveDeadline("20 días hábiles desde la publicación", null)).toMatchObject({ date: null, method: "unresolved" });
    expect(resolveDeadline("Concurso artes visuales", pub)).toMatchObject({ date: null, method: "unresolved" });
    expect(resolveDeadline(null, pub).method).toBe("unresolved");
  });

  it("flags results outside the loaded holiday calendar", () => {
    expect(resolveDeadline("20 días hábiles desde la publicación", "2028-03-01").note).toMatch(/fuera del calendario/);
  });

  it("parseDeadlineText exposes the rule", () => {
    expect(parseDeadlineText("treinta días naturales desde la publicación")).toEqual({ kind: "calendar-days", n: 30, anchor: "publication" });
    expect(parseDeadlineText("dos meses desde la notificación")).toEqual({ kind: "months", n: 2, anchor: "other" });
  });
});
