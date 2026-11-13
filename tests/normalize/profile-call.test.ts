import { CanonicalCall, CanonicalProfile, formatQualityReport, normalizeCall, normalizeProfile, validateCallDataset } from "@/features/normalize";
import { fixtureCalls } from "@/fixtures";
import { fixtureBusiness, fixtureCreator, makeCall, makeProfile } from "./helpers";

const codes = (ws: { code: string }[]) => ws.map((w) => w.code);

describe("normalizeProfile", () => {
  it("fixture creator: A Coruña city, persona física, ilustración + pintura, no warnings", () => {
    const { value, warnings } = normalizeProfile(fixtureCreator);
    expect(CanonicalProfile.parse(value)).toEqual(value);
    expect(value).toMatchObject({ territory: "mun:15030", beneficiaryTypes: ["persona-fisica"], disciplines: ["ilustracion", "pintura"], birthYear: 1994 });
    expect(warnings).toEqual([]);
  });

  it("fixture business: Lugo city, autónomo, CNAE-2009 2341 → CNAE-2025 23.41 (info)", () => {
    const { value, warnings } = normalizeProfile(fixtureBusiness);
    expect(value).toMatchObject({ territory: "mun:27028", beneficiaryTypes: ["autonomo"], cnae: { section: "C", code: "23.41" } });
    expect(warnings.map((w) => [w.code, w.severity])).toEqual([["legacy-cnae", "info"]]);
  });

  it("accepts messy place spellings and keeps the most specific", () => {
    expect(normalizeProfile(makeProfile({ city: "Coruña (A)", region: "galiza" })).value.territory).toBe("mun:15030");
    expect(normalizeProfile(makeProfile({ province: "Orense" })).value.territory).toBe("ES113");
    expect(normalizeProfile(makeProfile({ region: "Galicia" })).value.territory).toBe("ES11");
  });

  it("warns on inconsistent, unknown and missing data", () => {
    const disc = ["pintura"];
    expect(codes(normalizeProfile(makeProfile({ city: "Vigo", province: "Lugo", disciplines: disc })).warnings)).toEqual(["territory-inconsistent"]);
    expect(codes(normalizeProfile(makeProfile({ city: "Narnia", disciplines: disc })).warnings)).toEqual(["unmapped-territory", "missing-territory"]);
    const r = normalizeProfile(makeProfile({ disciplines: ["pintura", "astrología"] }));
    expect(r.value.disciplines).toEqual(["pintura"]);
    expect(codes(r.warnings)).toContain("unmapped-discipline");
    expect(codes(normalizeProfile({ ...fixtureBusiness, legalForm: undefined }).warnings)).toContain("missing-legal-form");
  });
});

describe("normalizeCall", () => {
  it("all scaffold fixture calls normalise with no error/warning-level issues", () => {
    for (const c of fixtureCalls) {
      const { value, warnings } = normalizeCall(c);
      expect(CanonicalCall.parse(value)).toEqual(value);
      expect(warnings.filter((w) => w.severity !== "info")).toEqual([]);
    }
  });

  it("fixture beca: A Coruña residence, 18–35, 9.000 € max, weights 40/40/20", () => {
    const { value } = normalizeCall(fixtureCalls.find((c) => c.id === "fixture-beca-artes-plasticas")!);
    expect(value.territories).toEqual(["ES111"]);
    expect(value.age).toEqual({ min: 18, max: 35 });
    expect(value.amount).toEqual({ maxCents: 900_000 });
    expect(value.disciplines).toEqual(["pintura", "ilustracion", "escultura", "fotografia"]);
    expect(value.criteria.map((c) => c.weightPct)).toEqual([40, 40, 20]);
  });

  it("fixture pymes: legal forms → autónomo + pyme, Galicia", () => {
    const { value } = normalizeCall(fixtureCalls.find((c) => c.id === "fixture-digitalizacion-pymes")!);
    expect(value.beneficiaryTypes).toEqual(["autonomo", "pyme"]);
    expect(value.beneficiarySource).toBe("explicit");
    expect(value.territories).toEqual(["ES11"]);
    expect(value.maxEmployees).toBe(9);
  });

  it("empty residence = state-wide; local scope without residence is flagged", () => {
    expect(normalizeCall(makeCall()).value.territories).toEqual(["ES"]);
    const local = normalizeCall(makeCall({ scope: "local", region: "Vigo" }));
    expect(local.value.territories).toEqual(["ES"]);
    expect(codes(local.warnings)).toContain("territory-implicit");
  });

  it("parses amountText when amountEur is empty and flags inconsistencies", () => {
    expect(normalizeCall(makeCall({ amountText: "Entre 3.000 y 6.000 €" })).value.amount).toEqual({ minCents: 300_000, maxCents: 600_000 });
    expect(codes(normalizeCall(makeCall({ amountText: "Una estancia de dos meses" })).warnings)).toContain("amount-unparsed");
    expect(codes(normalizeCall(makeCall({ amountText: "Consultar bases" })).warnings)).not.toContain("amount-unparsed");
    expect(codes(normalizeCall(makeCall({ amountEur: { min: 9000, max: 3000 } })).warnings)).toContain("amount-inconsistent");
  });

  it("resolves deadline text with the publication date and the call's regional holidays", () => {
    const c = makeCall({ deadline: null, deadlineText: "20 días hábiles desde el día siguiente a la publicación en el DOG", eligibility: { residence: ["Galicia"] } });
    expect(normalizeCall(c).value.deadline.date).toBeNull();
    expect(codes(normalizeCall(c).warnings)).toContain("missing-deadline");
    const withPub = normalizeCall(c, { publicationDate: "2026-06-10" });
    // 24 Jun (San Xoán) is inhábil in Galicia
    expect(withPub.value.deadline).toMatchObject({ date: "2026-07-09", estimated: true });
    expect(codes(withPub.warnings)).toEqual(["estimated-deadline"]);
    expect(normalizeCall(makeCall({ deadline: "2026-12-15", deadlineText: "15/12/2026 (estimado)" })).value.deadline.estimated).toBe(true);
  });

  it("parses age from eligibility.other when min/max are absent", () => {
    expect(normalizeCall(makeCall({ eligibility: { other: ["Artistas menores de 35 años"] } })).value.age).toEqual({ max: 34 });
  });

  it("warns on criteria that do not sum to 100 and on bases without criteria", () => {
    const c = makeCall({ criteriaSource: "bases", criteria: [{ id: "a", name: "A", description: "", maxPoints: 6 }, { id: "b", name: "B", description: "", maxPoints: 4 }] });
    const r = normalizeCall(c);
    expect(r.value.criteria.map((x) => x.weightPct)).toEqual([60, 40]);
    expect(codes(r.warnings)).toContain("criteria-sum");
    expect(codes(normalizeCall(makeCall({ criteriaSource: "bases", criteria: [] })).warnings)).toContain("criteria-empty");
    expect(codes(normalizeCall(makeCall({ criteriaSource: "estimated", criteria: [] })).warnings)).not.toContain("criteria-empty");
  });

  it("'cualquier disciplina' means no restriction", () => {
    expect(normalizeCall(makeCall({ disciplines: ["todas las disciplinas artísticas"] })).value.disciplines).toEqual([]);
  });
});

describe("validateCallDataset", () => {
  it("reports invalid records, duplicates, unmapped values and coverage", () => {
    const report = validateCallDataset([
      ...fixtureCalls,
      makeCall({ id: "fixture-premio-ilustracion" }),
      makeCall({ id: "x", bdnsId: "1", eligibility: { residence: ["Narnia"] } }),
      makeCall({ id: "y", bdnsId: "1", deadline: null, deadlineText: "Consultar" }),
      { id: "broken", title: "sin campos" },
    ]);
    expect(report.total).toBe(7);
    expect(report.valid).toBe(6);
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0].id).toBe("broken");
    expect(report.byCode["duplicate-id"]).toBe(2);
    expect(report.byCode["unmapped-territory"]).toBe(1);
    expect(report.byCode["missing-deadline"]).toBe(1);
    expect(report.coverage.byCcaa.ES11).toBe(2);
    expect(report.coverage.criteriaSum100).toBe(3);
    expect(report.errors).toBe(4);
    expect(formatQualityReport(report)).toMatch(/^Convocatorias: 7 · válidas: 6/);
  });
});
