import { PastAward } from "@/contracts/domain";
import {
  type BdnsAward,
  CallHistory,
  isSameSeries,
  searchTerms,
  summarizeHistory,
  titleCoreTokens,
  toPastAwards,
  winnerShareFor,
  winnerType,
} from "@/features/history/history";
import { normalizeProfile } from "@/features/normalize";
import { fixtureBusiness, fixtureCreator } from "@/fixtures";

const FORNELOS = "AYUNTAMIENTO DE FORNELOS DE MONTES";
const ICAA = "INSTITUTO DE LA CINEMATOGRAFÍA Y DE LAS ARTES AUDIOVISUALES";
const icaaTitle = (date: string, year: number, line = "cortometrajes realizados") =>
  `Resolución de ${date} de la Dirección General del Instituto de la Cinematografía y de las Artes Audiovisuales, por la que se convocan para el año ${year} ayudas a la producción de ${line}.`;

describe("edition linking", () => {
  it("core tokens drop edition markers, years, months and accents", () => {
    expect(titleCoreTokens("XV Edición del Premio de Poesía Manuel Lueiro Rey 2026")).toEqual(["premio", "poesia", "manuel", "lueiro", "rey"]);
    expect(titleCoreTokens('Bases y convocatoria XXXIV Edición Premios "Antón Losada Diéguez"')).toEqual(["premio", "anton", "losada", "dieguez"]);
    expect(titleCoreTokens("Resolución de 12 de noviembre de 2026")).toEqual([]);
  });

  it("search terms are original-text pairs of distinctive words", () => {
    expect(searchTerms("XV Edición del Premio de Poesía Manuel Lueiro Rey")).toEqual(["Poesía Manuel", "Manuel Lueiro"]);
    expect(searchTerms("XXXIV CERTAMEN LÓPEZ-VILLASEÑOR DE ARTES PLÁSTICAS 2025")).toEqual(["LÓPEZ-VILLASEÑOR", "ARTES PLÁSTICAS"]);
    expect(searchTerms("CONCURSO DE CARTELES 2027")).toEqual(["CARTELES"]);
  });

  it("same organizer and all core tokens of the shorter title", () => {
    const cur = { title: "XV Edición del Premio de Poesía Manuel Lueiro Rey", organizer: FORNELOS };
    expect(isSameSeries(cur, { title: "XIII edición del premio de poesía Manuel Lueiro Rey", organizer: FORNELOS })).toBe(true);
    expect(isSameSeries(cur, { title: "IX edición del Premio de Periodismo Manuel Lueiro Rey", organizer: FORNELOS })).toBe(false);
    expect(isSameSeries(cur, { title: "XXXIII PREMIO MANUEL LUEIRO REY DE POESIA", organizer: "AYUNTAMIENTO DE GROVE, O" })).toBe(false);

    const icaa = { title: icaaTitle("12 de noviembre de 2026", 2027), organizer: ICAA };
    expect(isSameSeries(icaa, { title: icaaTitle("11 de marzo de 2026", 2026), organizer: ICAA })).toBe(true);
    expect(isSameSeries(icaa, { title: "Ayudas a la producción de cortometrajes realizados año 2018.", organizer: ICAA })).toBe(true);
    expect(isSameSeries(icaa, { title: icaaTitle("11 de marzo de 2026", 2026, "cortometrajes sobre proyecto"), organizer: ICAA })).toBe(false);
  });
});

describe("winner types from the published NIF", () => {
  it("maps NIF letters to canonical beneficiary types", () => {
    expect(winnerType("***1768** MARIA EJEMPLO")).toBe("persona");
    expect(winnerType("B12345678 PRODUCTORA, S.L.")).toBe("pyme");
    expect(winnerType("F46123456 PANGUR ANIMATION, COOP. V.")).toBe("pyme");
    expect(winnerType("G86741063 THE OLD BIG BAND TORREJON")).toBe("entidad-sin-animo-lucro");
    expect(winnerType("P1503000J CONCELLO")).toBe("entidad-publica");
    expect(winnerType("E15123456 HERMANOS, C.B.")).toBe("colectivo");
    expect(winnerType("SIN NIF")).toBeNull();
  });
});

const award = (id: number, idPersona: number, importe: number, beneficiario = "***1234** X"): BdnsAward => ({
  codConcesion: String(id),
  idPersona,
  importe,
  beneficiario,
  fechaConcesion: "2025-11-01",
});

describe("summarizeHistory", () => {
  const h = summarizeHistory({
    callId: "bdns-1",
    bdnsId: "1",
    builtAt: "2026-11-13",
    editions: [
      { bdnsId: "a", date: "2024-09-01", title: "t", awards: [award(1, 1, 1000), award(2, 2, 3000)] },
      { bdnsId: "b", date: "2025-09-01", title: "t", awards: [award(3, 1, 2000), award(4, 3, 2000), award(5, 4, 500, "G12345678 ASOC EJEMPLO")] },
      { bdnsId: "c", date: "2023-09-01", title: "t", awards: [] },
    ],
    resolutions: [
      { bdnsId: "b", applicants: 60, cutoffScore: 68, maxScore: 100, sourceUrl: "https://example.org/dog" },
      { bdnsId: "a", applicants: 50, awarded: 10, cutoffScore: 55.5, maxScore: 100, sourceUrl: "https://example.org/dog-a" },
    ],
  });

  it("aggregates editions, repeats, success rate and cutoffs", () => {
    expect(CallHistory.parse(h)).toBeTruthy();
    expect(h.editionsFound).toBe(3);
    expect(h.editionsWithAwards).toBe(2);
    expect(h.awardsPerEdition).toBe(2.5);
    expect(h.amountRangeEur).toEqual({ min: 500, max: 3000 });
    expect(h.winners).toEqual({ persona: 4, "entidad-sin-animo-lucro": 1 });
    expect(h.repeatWinnerShare).toBe(1 / 4); // person 1 of {1,2,3,4}
    expect(h.successRate).toEqual({ awarded: 3, applicants: 60, rate: 0.05, bdnsId: "b" });
    expect(h.cutoff?.score).toBe(68); // latest edition wins
    expect(h.cutoffRange).toEqual({ min: 55.5, max: 68, editions: 2 });
    expect(h.editions[0].bdnsId).toBe("b"); // newest first
    expect(h.evidence).toMatch(/80 % de los premiados son personas físicas/);
    expect(h.evidence).toMatch(/Nota de corte entre 55,5 y 68 en 2 ediciones/);
  });

  it("stores no beneficiary names", () => {
    expect(JSON.stringify(h)).not.toMatch(/ASOC|\*\*\*/);
  });

  it("winner share uses the canonical profile types", () => {
    const creator = normalizeProfile(fixtureCreator).value.beneficiaryTypes;
    const business = normalizeProfile(fixtureBusiness).value.beneficiaryTypes;
    expect(winnerShareFor(h, creator)).toEqual({ compatible: 4, total: 5, share: 0.8 });
    expect(winnerShareFor(h, ["entidad-sin-animo-lucro"])).toEqual({ compatible: 1, total: 5, share: 0.2 });
    expect(winnerShareFor(h, business)?.total).toBe(5);
  });

  it("small samples are flagged and get no repeat share", () => {
    const one = summarizeHistory({ callId: "x", bdnsId: "x", builtAt: "2026-11-13", editions: [{ bdnsId: "a", date: "2024-01-01", title: "t", awards: [award(1, 1, 100)] }] });
    expect(one.repeatWinnerShare).toBeUndefined();
    expect(one.evidence).toMatch(/1 edición anterior/);
    expect(one.evidence).toMatch(/Muestra pequeña/);
    expect(winnerShareFor(summarizeHistory({ callId: "y", bdnsId: "y", builtAt: "2026-11-13", editions: [] }), ["pyme"])).toBeUndefined();
  });
});

describe("toPastAwards", () => {
  it("exports entity winners as contract PastAwards and never natural persons", () => {
    const rows = toPastAwards({
      callId: "bdns-941955",
      organizer: ICAA,
      discipline: "cine",
      sourceUrlFor: (id) => `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/${id}`,
      editions: [{ bdnsId: "892721", date: "2026-03-12", title: "ICAA 2026", awards: [award(9, 9, 27586.21, "B12345678 PRODUCTORA, S.L."), award(10, 10, 100)] }],
    });
    expect(rows).toHaveLength(1);
    expect(PastAward.parse(rows[0])).toMatchObject({ beneficiary: "PRODUCTORA, S.L.", beneficiaryKind: "business", year: 2025, amountEur: 27586.21, discipline: "cine" });
  });
});
