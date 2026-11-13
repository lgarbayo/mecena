import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Call } from "@/contracts";
import { isApplicable, isOpenish, isRelevantRegion, runIngest } from "@/features/calls-ingest/ingest";
import { callsIngestAi } from "@/features/calls-ingest/ai";
import { listCalls } from "@/server/store";

// Real BDNS records captured on 2026-11-13 (data/calls/raw/)
const laracha = JSON.parse(fs.readFileSync("data/calls/raw/939879.json", "utf8")); // open, Galicia, competitive
const icaa = JSON.parse(fs.readFileSync("data/calls/raw/941955.json", "utf8")); // open, Spain-wide
const directAward = { ...laracha, codigoBDNS: "999001", tipoConvocatoria: "Concesión directa - instrumental" };
const closed = { ...laracha, codigoBDNS: "999002", abierto: false, fechaFinSolicitud: "2026-09-30" };

function stubFetch(records: Record<string, unknown>[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/convocatorias/busqueda")) {
      return Response.json({ content: records.map((r) => ({ numeroConvocatoria: r.codigoBDNS })), totalElements: records.length });
    }
    const code = new URL(url).searchParams.get("numConv");
    const rec = records.find((r) => r.codigoBDNS === code);
    return rec ? Response.json(rec) : new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const opts = (fetchImpl: typeof fetch) => ({
  fetchImpl,
  ai: callsIngestAi.mock,
  callsDir: process.env.MECENA_CALLS_DIR!,
  queries: [{ descripcion: "fotografía" }],
  today: "2026-11-13",
  delayMs: 0,
});

describe("BDNS filters", () => {
  it("keeps open applicable calls for Galicia or Spain; drops direct awards and closed calls", () => {
    expect(isApplicable(laracha)).toBe(true);
    expect(isApplicable(directAward)).toBe(false);
    expect(isRelevantRegion(laracha)).toBe(true);
    expect(isRelevantRegion({ regiones: [{ descripcion: "ES30 - COMUNIDAD DE MADRID" }] })).toBe(false);
    expect(isOpenish(laracha, "2026-11-13")).toBe(true);
    expect(isOpenish(closed, "2026-11-13")).toBe(false);
  });
});

describe("runIngest", () => {
  it("writes valid Calls to bdns-cache.json and the store merges them after the seed", async () => {
    const r = await runIngest(opts(stubFetch([laracha, icaa, directAward, closed])));
    expect(r.ok).toBe(true);
    expect(r.written).toBe(2);
    expect(r.skipped.map((s) => s.bdnsId).sort()).toEqual(["999001", "999002"]);

    const cache = JSON.parse(fs.readFileSync(path.join(process.env.MECENA_CALLS_DIR!, "bdns-cache.json"), "utf8")) as unknown[];
    const calls = cache.map((c) => Call.parse(c));
    const l = calls.find((c) => c.bdnsId === "939879")!;
    expect(l.id).toBe("bdns-939879");
    expect(l.source).toBe("bdns");
    expect(l.beneficiaryKinds).toEqual(["creator", "business"]); // BDNS: personas físicas + entidades sin ánimo de lucro, via the data standard
    expect(l.eligibility.residence).toEqual([]); // BDNS regiones = impact area, never turned into a residence rule
    expect(l.sourceUrl).toMatch(/^https:\/\/www\.infosubvenciones\.es\//);
    expect(l.disciplines).toContain("fotografia");
    expect(fs.existsSync(path.join(process.env.MECENA_CALLS_DIR!, "raw", "939879.json"))).toBe(true);

    expect(listCalls().map((c) => c.id)).toEqual(expect.arrayContaining(["fixture-beca-artes-plasticas", "bdns-939879"]));
  });

  it("keeps the previous cache when BDNS fails", async () => {
    await runIngest(opts(stubFetch([laracha])));
    const file = path.join(process.env.MECENA_CALLS_DIR!, "bdns-cache.json");
    const before = fs.readFileSync(file, "utf8");
    const failing = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const r = await runIngest(opts(failing));
    expect(r.ok).toBe(false);
    expect(r.kept).toBe(1);
    expect(r.error).toMatch(/ECONNRESET/);
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  it("retries on 429 and then succeeds", async () => {
    let calls = 0;
    const base = stubFetch([laracha]);
    const flaky = (async (input: string | URL | Request, init?: RequestInit) => {
      if (++calls === 1) return new Response("slow down", { status: 429 });
      return base(input, init);
    }) as typeof fetch;
    const r = await runIngest(opts(flaky));
    expect(r.ok).toBe(true);
    expect(r.written).toBe(1);
  });
});
