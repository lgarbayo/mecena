import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AiService } from "@/contracts";
import { callsIngestAi } from "@/features/calls-ingest/ai";
import { runNationalSweep } from "@/features/calls-ingest/national-sweep";
import { readCatalog } from "@/features/calls-ingest/live";
import { openToCreators, sweepCandidates, titleVerdict, type SweepPageClient } from "@/features/calls-ingest/sweep";
import { liveCallsFile } from "@/server/store";

// Titles are real BDNS records (culture, published Aug-Nov 2026): the filter is tuned on what BDNS actually holds,
// where most "cultura" records are agreements and grants to a named association, not calls for an artist.
const KEEP = [
  "XXV CERTAMEN DE TEATRO AFICIONADO ANA Mª VIDAL . BRUNETE 2027",
  "BASES DE CONVOCATORIA PARA LA CONCESIÓN DEL LII PREMIO CÁCERES DE NOVELA CORTA 2027",
  "BASES DE CONVOCATORIA DEL XXIII CONCURSO EL BROCENSE DE MICRORRELATOS 2027",
  "III CERTAMEN DE PINTURA RÁPIDA AL AIRE LIBRE CIUDAD DE TRUJILLO",
  "Concurso Cartel Anunciador Semana Santa 2027", // a poster is a poster, even for the fiestas
  "Convocatoria concurso del cartel anunciador de las Fallas 2027",
  "V CONCURSO FOTOGRÁFICO EXCMO. AYUNT. TALAVERA DE LA REINA 2026",
  "BASES Y PREMIOS QUE HAN DE REGIR EL 18ª CONCURSO LOCAL DE CORTOMETRAJES CREATRIVAS.NET",
  "Subvenciones a la producción de espectáculos de artes escénicas de carácter profesional, 2026",
  "Resolución de 12 de noviembre de 2026 de la Dirección General del Instituto de la Cinematografía y de las Artes Audiovisuales, por la que se convocan ayudas", // "Instituto de …" is not a school
  "Convocatoria del XL Concurso Literario de Lasarte-Oria 2026",
  "BASES Y CONVOCATORIA DE PREMIO ANTÓN LOSADA DIÉGUEZ-EDICIÓN XLII", // generic prize words alone, nothing says it is for someone else
];

const DROP: [title: string, reason: RegExp][] = [
  ["CONVENIO REGULADOR DE LA SUBVENCIÓN NOMINATIVA AL ORFEÓN CREVILLENTINO", /convenio/],
  ["SUBVENCION CULTURAL A LA ASOCIACIÓN IGNIS LENTIUM", /nominativa|concedida/],
  ["SUBV NOM ACADEMIA DE ARTES ESCENICAS DE ANDALUCIA", /nominativa|concedida/],
  ["SN a la Escuela Superior de Arte Dramático de Extremadura para financiar la celebración del XII Concurso Internacional", /nominativa|concedida/],
  ["Subvención a favor de la Diócesis de San Cristóbal de La Laguna (Obispado de Tenerife) para restauración órganos musicales", /nominativa|concedida/],
  ["Ajut directe Ajnt. Guissona- Nova construcció Museu Eduard Camps", /nominativa|concedida/],
  ["CONCESIÓN DE PREMIOS DEL CONCURSO DE PINTURA RAPIDA DE OTOÑO 2026", /ya concedida|concedida/], // already awarded: not a call
  ["Resolución 6 noviembre 2026, concesión subvención a la UPV para el funcionamiento", /nominativa|concedida/],
  ["CONVOCATORIA DE SUBVENCIONES PARA ENTIDADES CULTURALES POR CONCURRENCIA COMPETITIVA AÑO 2026", /entidades/],
  ["Convocatoria de subvenciones para la adquisición de fondos bibliográficos destinados a bibliotecas", /entidades/],
  ["II Concurso de dibujo infantil de Navidad del Ayuntamiento de Toén", /menores|entidades/],
  ["CONCURSO DE BELENES Y ÁRBOLES DE NAVIDAD 2026", /fiestas/],
  ["XXII CONCURSO DEL MOSTO", /fiestas/],
  ["XXX CONCURSO DE AGRUPACIONES CARNAVALESCAS MARBELLA 2027", /fiestas|entidades/],
  ["Convocatoria de ayudas para la rehabilitación de bienes inmuebles integrantes del patrimonio histórico", /entidades|patrimonio/],
  ["Convocatoria de subvenciones municipales para el fomento del deporte individual", /entidades|deporte/],
  ["Premios Carme Barceló i Torres 2027 a la calidad lingüística en la docencia en valenciano", /entidades|menores|patrimonio/], // academic prizes are not for artists
  ["Convocatoria Premios a Trabajos Fin de Máster del Aula de Seguridad y Salud Laboral", /entidades|menores|patrimonio/],
  ["RESOLUCIÓN REY JUAN CARLOS CONVOCATORIA CONCURSO DE FOTOGRAFÍA DE LA UNIVERSIDAD", /entidades|menores|patrimonio/], // inside a university: not open to artists in general
  ["XVII PREMIOS DE PERIODISMO “CIUDAD DE MÁLAGA”", /entidades|menores|patrimonio/],
  ["CONVOCATORIA DE BECAS PARA CURSOS DE EUSKERA 2025/2026", /entidades|menores|patrimonio/],
  ["CONVOCATORIA 2026 BASES PREMIOS BACHILLERATO, FORMACIÓN PROFESIONAL Y ENSEÑANZAS PROFESIONALES DE MÚSICA", /entidades|menores|patrimonio/],
  ["CONVOCATORIA DE BECAS DE LA ESCUELA MUNICIPAL DE MUSICA ROBERT GERHARD. CURSO 2026/27", /entidades|menores|patrimonio/],
  ["Premios Santa Pola Emprende 2026", /entidades|menores|patrimonio/],
  ["CONVOCATORIA DEL CONCURSO DE TOSTADORES DE CASTAÑAS 2026", /fiestas/],
  ["Descuentos en el transporte para vecinos 2027", /sin señal/], // "cuento" inside "descuentos" is not a short story
  ["SUBVENCIÓN EN REGIMEN DE CONCURRENCIA COMPETITIVA EN MATERIA DE CULTURA, BASES Y CONVOCATORIA", /sin señal/], // no sign it is for an artist: the catalogue stays clean
];

describe("titleVerdict (no network, no AI)", () => {
  it.each(KEEP)("keeps a call an artist can apply to: %s", (title) => {
    expect(titleVerdict(title).keep).toBe(true);
  });

  it.each(DROP)("drops %s", (title, reason) => {
    const v = titleVerdict(title);
    expect(v.keep).toBe(false);
    if (!v.keep) expect(`${v.reason} ${v.matched}`.toLowerCase()).toMatch(reason);
  });

  it("tells an artistic title from a generic prize title, which needs a cultural BDNS purpose", () => {
    expect(titleVerdict("III CERTAMEN DE PINTURA RÁPIDA")).toMatchObject({ keep: true, strength: "artist" });
    expect(titleVerdict("Premio Nacional de Estadística 2026")).toMatchObject({ keep: false }); // "estadística" is academic
    expect(titleVerdict("PREMIOS CIUDAD DE VILLAFRIA 2026")).toMatchObject({ keep: true, strength: "generic" });
  });

  it("says which fragment of the title decided it, so the lists can be tuned", () => {
    const v = titleVerdict("III CERTAMEN DE PINTURA RÁPIDA");
    expect(v).toMatchObject({ keep: true, matched: "pintura" });
    expect(titleVerdict("")).toMatchObject({ keep: false, reason: "sin título" });
  });
});

describe("openToCreators (free check on the full BDNS record)", () => {
  const laracha = JSON.parse(fs.readFileSync("data/calls/raw/939879.json", "utf8"));
  const withBeneficiaries = (...descripcion: string[]) => ({ ...laracha, tiposBeneficiarios: descripcion.map((d) => ({ descripcion: d })) });

  it("accepts people, freelancers and unknown beneficiaries", () => {
    expect(openToCreators(withBeneficiaries("PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA")).ok).toBe(true);
    expect(openToCreators(withBeneficiaries("PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA")).ok).toBe(true);
    expect(openToCreators(withBeneficiaries("SIN INFORMACION ESPECIFICA")).ok).toBe(true);
    expect(openToCreators(withBeneficiaries()).ok).toBe(true);
  });

  it("refuses calls only for entities, companies or administrations", () => {
    expect(openToCreators(withBeneficiaries("PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA"))).toMatchObject({ ok: false, reason: expect.stringMatching(/^solo para entidad-sin-animo-lucro/) });
    expect(openToCreators(withBeneficiaries("GRAN EMPRESA")).ok).toBe(false);
    expect(openToCreators(withBeneficiaries("ADMINISTRACIONES PUBLICAS")).ok).toBe(false);
  });
});

describe("sweepCandidates", () => {
  const hit = (code: string, title: string) => ({ code, title, organ: "AYTO" });

  it("pages through a search, dedupes by BDNS code across searches and counts what the title filter drops", async () => {
    const pages: Record<string, ReturnType<typeof hit>[][]> = {
      culture: [
        [hit("1", "CERTAMEN DE PINTURA RAPIDA"), hit("2", "CONVENIO DE COLABORACION CON LA ASOCIACION X")],
        [hit("3", "PREMIO DE POESIA 2027"), hit("2", "CONVENIO DE COLABORACION CON LA ASOCIACION X")],
      ],
      cartel: [[hit("1", "CERTAMEN DE PINTURA RAPIDA"), hit("4", "CONCURSO DE BELENES 2026")]],
    };
    const calls: string[] = [];
    const client: SweepPageClient = {
      async searchPage(q, _since, page, pageSize) {
        const key = q.finalidad ? "culture" : "cartel";
        calls.push(`${key}:${page}`);
        const hits = pages[key][page] ?? [];
        return { hits, last: hits.length < pageSize };
      },
    };
    const r = await sweepCandidates(client, { since: "15/08/2026", pageSize: 2, queries: [{ query: { finalidad: "11" }, maxPages: 5 }, { query: { descripcion: "cartel" }, maxPages: 5 }] });

    expect(calls).toEqual(["culture:0", "culture:1", "culture:2", "cartel:0", "cartel:1"]); // an empty/short page ends the search
    expect(r.candidates.map((c) => c.code)).toEqual(["1", "3"]);
    expect(r.stats).toMatchObject({ searches: 5, seen: 4, kept: 2 });
    expect(Object.values(r.stats.dropped).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("trusts a generic prize title only when the culture search found it", async () => {
    const client: SweepPageClient = {
      async searchPage(q) {
        return q.finalidad === "11"
          ? { hits: [hit("1", "PREMIOS CIUDAD DE VILLAFRIA 2026"), hit("3", "CERTAMEN DE PINTURA")], last: true }
          : { hits: [hit("1", "PREMIOS CIUDAD DE VILLAFRIA 2026"), hit("2", "PREMIOS DE LA CIUDAD DEL DEPORTE 2026X"), hit("3", "CERTAMEN DE PINTURA")], last: true };
      },
    };
    const r = await sweepCandidates(client, { since: "x", queries: [{ query: { descripcion: "premio" }, maxPages: 1 }, { query: { finalidad: "11" }, maxPages: 1 }] });
    // 1: generic but also found by culture (even though the term search saw it first) → kept; 2: generic, term search only → dropped
    expect(r.candidates.map((c) => c.code).sort()).toEqual(["1", "3"]);
    expect(r.stats.dropped["premio genérico fuera de cultura"] ?? 0).toBe(0); // "deporte" died on its title, not here
    const onlyTerm = await sweepCandidates(client, { since: "x", queries: [{ query: { descripcion: "premio" }, maxPages: 1 }] });
    expect(onlyTerm.candidates.map((c) => c.code)).toEqual(["3"]);
    expect(onlyTerm.stats.dropped["premio genérico fuera de cultura"]).toBe(1);
  });

  it("honours the page budget and survives one failing search", async () => {
    let n = 0;
    const client: SweepPageClient = {
      async searchPage(q, _s, page) {
        if (q.descripcion === "roto") throw new Error("BDNS 500");
        n++;
        return { hits: [hit(`c${page}`, "CERTAMEN DE PINTURA")], last: false };
      },
    };
    const log = vi.fn();
    const r = await sweepCandidates(client, { since: "x", pageSize: 1, queries: [{ query: { descripcion: "roto" }, maxPages: 3 }, { query: { finalidad: "11" }, maxPages: 2 }], log });
    expect(n).toBe(2); // maxPages
    expect(r.candidates).toHaveLength(2);
    expect(log.mock.calls.flat().join(" ")).toMatch(/failed: BDNS 500/);
  });
});

describe("runNationalSweep", () => {
  const TODAY = "2026-11-13";
  const laracha = JSON.parse(fs.readFileSync("data/calls/raw/939879.json", "utf8")); // open photography contest, persona física
  const records = [
    { ...laracha, codigoBDNS: "880001", descripcion: "V CONCURSO DE FOTOGRAFÍA A LARACHA NO OBXECTIVO" },
    { ...laracha, codigoBDNS: "880002", descripcion: "CONCURSO DE FOTOGRAFÍA DE PAISAJE", tiposBeneficiarios: [{ descripcion: "PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA" }] },
    { ...laracha, codigoBDNS: "880003", descripcion: "PREMIO DE POESÍA CERRADO", abierto: false, fechaFinSolicitud: "2026-10-01T00:00:00", textFin: null },
    { ...laracha, codigoBDNS: "880004", descripcion: "CERTAMEN DE PINTURA DE OTOÑO", tipoConvocatoria: "Concesión directa - instrumental" },
  ];
  const titles = [...records.map((r) => r.descripcion), "CONVENIO DE COLABORACIÓN CON LA ASOCIACIÓN CULTURAL X"]; // the 5th never reaches the detail

  const stubFetch = (seen: string[] = []) =>
    (async (input: string | URL | Request) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("/convocatorias/busqueda")) {
        return Response.json({
          content: [...records.map((r) => ({ numeroConvocatoria: r.codigoBDNS, descripcion: r.descripcion })), { numeroConvocatoria: "880005", descripcion: titles[4] }],
          last: true,
        });
      }
      const rec = records.find((r) => r.codigoBDNS === new URL(url).searchParams.get("numConv"));
      return rec ? Response.json(rec) : new Response("not found", { status: 404 });
    }) as typeof fetch;

  const countingAi = () => {
    const spy = vi.fn(callsIngestAi.mock.structureCall);
    return { ai: { structureCall: spy } as Pick<AiService, "structureCall">, spy };
  };
  const base = { delayMs: 0, today: TODAY, queries: [{ query: { finalidad: "11" }, maxPages: 1 }] };

  it("applies the free filters in order and only structures what is left", async () => {
    const seen: string[] = [];
    const { ai, spy } = countingAi();
    const r = await runNationalSweep({ ...base, ai, maxNew: 10, fetchImpl: stubFetch(seen) });

    expect(r.ok).toBe(true);
    expect(r.stats).toMatchObject({ seen: 5, kept: 4 }); // the convenio dies on its title
    expect(seen.filter((u) => u.includes("numConv=")).map((u) => new URL(u).searchParams.get("numConv")).sort()).toEqual(["880001", "880002", "880003", "880004"]); // never the convenio
    expect(r.ingest!.skipped.map((s) => [s.bdnsId, s.reason]).sort()).toEqual([
      ["880002", expect.stringMatching(/^solo para entidad/)],
      ["880003", "cerrada"],
      ["880004", expect.stringMatching(/no aplicable/)],
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.ingest!.found).toEqual(["bdns-880001"]);
    expect(readCatalog().map((c) => c.id)).toEqual(["bdns-880001"]);
  });

  it("a second run reads nothing again and never pays Claude twice", async () => {
    const first = countingAi();
    await runNationalSweep({ ...base, ai: first.ai, maxNew: 10, fetchImpl: stubFetch() });
    const second = countingAi();
    const seen: string[] = [];
    const r = await runNationalSweep({ ...base, ai: second.ai, maxNew: 10, fetchImpl: stubFetch(seen) });
    expect(second.spy).not.toHaveBeenCalled();
    expect(seen.some((u) => u.includes("numConv=880001"))).toBe(false);
    expect(r.ingest!.found).toEqual(["bdns-880001"]);
  });

  it("dry run reports what would be structured but calls no Claude and writes no catalogue", async () => {
    const { ai, spy } = countingAi();
    const r = await runNationalSweep({ ...base, ai, maxNew: 10, dryRun: true, fetchImpl: stubFetch() });
    expect(r.ingest!.wouldStructure).toEqual(["880001"]);
    expect(r.ingest!.structured).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(fs.existsSync(liveCallsFile())).toBe(false);
  });

  it("maxNew caps the Claude spend and the rest waits for the next run", async () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ ...laracha, codigoBDNS: `88010${i}`, descripcion: `CERTAMEN DE PINTURA ${i}` }));
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/convocatorias/busqueda")) return Response.json({ content: many.map((r) => ({ numeroConvocatoria: r.codigoBDNS, descripcion: r.descripcion })), last: true });
      const rec = many.find((r) => r.codigoBDNS === new URL(url).searchParams.get("numConv"));
      return rec ? Response.json(rec) : new Response("not found", { status: 404 });
    }) as typeof fetch;
    const { ai, spy } = countingAi();
    const r = await runNationalSweep({ ...base, ai, maxNew: 2, fetchImpl });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(r.ingest!.skipped.filter((s) => /tope/.test(s.reason))).toHaveLength(2);
  });

  it("a BDNS outage ends the run without touching the catalogue", async () => {
    const { ai, spy } = countingAi();
    const down = (async () => new Response("down", { status: 503 })) as typeof fetch;
    const r = await runNationalSweep({ ...base, ai, maxNew: 5, fetchImpl: down, delayMs: 0 });
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(fs.existsSync(liveCallsFile())).toBe(false);
  });
});
