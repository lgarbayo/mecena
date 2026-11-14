import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AiService, Profile } from "@/contracts";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID, FIXTURE_NOW, fixtureCalls, fixtureCreator } from "@/fixtures";
import { callsIngestAi } from "@/features/calls-ingest/ai";
import {
  getProfileSearch,
  ingestIntoCatalog,
  profileQueries,
  pruneCatalog,
  readCatalog,
  refreshCatalog,
  runProfileSearch,
  scheduleProfileSearch,
} from "@/features/calls-ingest/live";
import { refreshIfDue } from "@/features/calls-ingest/scheduler";
import { searchCalls } from "@/features/matching/service";
import { liveCallsFile, listCalls, saveProfile } from "@/server/store";

// Real BDNS records captured on 2026-11-13 (data/calls/raw/)
const laracha = JSON.parse(fs.readFileSync("data/calls/raw/939879.json", "utf8")); // open, A Coruña (ES111), competitive
const icaa = JSON.parse(fs.readFileSync("data/calls/raw/941955.json", "utf8")); // open, Spain-wide
const directAward = { ...laracha, codigoBDNS: "999001", tipoConvocatoria: "Concesión directa - instrumental" };
const TODAY = "2026-11-13";

function stubFetch(records: Record<string, unknown>[], seen: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("/convocatorias/busqueda")) {
      return Response.json({ content: records.map((r) => ({ numeroConvocatoria: r.codigoBDNS })), totalElements: records.length });
    }
    const code = new URL(url).searchParams.get("numConv");
    const rec = records.find((r) => r.codigoBDNS === code);
    return rec ? Response.json(rec) : new Response("not found", { status: 404 });
  }) as typeof fetch;
}

/** The mock structurer, counting how often Claude would have been paid. */
function countingAi() {
  const spy = vi.fn(callsIngestAi.mock.structureCall);
  return { ai: { structureCall: spy } as Pick<AiService, "structureCall">, spy };
}

const valencianProducer: Profile = {
  ...structuredClone(fixtureCreator),
  id: "test-productora",
  kind: "business",
  displayName: "Llum Films SL",
  territory: undefined,
  city: "Valencia",
  province: "Valencia",
  region: "Comunitat Valenciana",
  legalForm: "sl",
  cnae: "5911",
  sector: "producción audiovisual / cine",
  disciplines: [],
};

const opts = (fetchImpl: typeof fetch, ai = countingAi().ai) => ({ fetchImpl, ai, delayMs: 0, today: TODAY });

describe("profileQueries", () => {
  it("derives BDNS filters from the profile: discipline → descripcion, region → regiones, kind → finalidad", () => {
    const q = profileQueries(fixtureCreator); // illustrator + painter in A Coruña
    expect(q.queries).toEqual([{ finalidad: "11", regiones: "3" }, { descripcion: "ilustración" }, { descripcion: "pintura" }]);
    expect(q.regions).toEqual(["ES11"]);
    expect(profileQueries(structuredClone(fixtureCreator)).signature).toBe(q.signature); // deterministic
  });

  it("a Valencian production company searches pymes + culture aid in its own region and its sector words", async () => {
    const saved = await saveProfile(structuredClone(valencianProducer)); // the store derives the canonical territory
    const q = profileQueries(saved);
    expect(q.regions).toEqual(["ES52"]);
    expect(q.queries).toEqual(
      expect.arrayContaining([{ finalidad: "14", regiones: expect.any(String) }, { finalidad: "11", regiones: expect.any(String) }, { descripcion: "producción audiovisual" }]),
    );
    expect(q.queries.find((x) => x.finalidad === "14")!.regiones).not.toBe("3");
    expect(q.signature).not.toBe(profileQueries(fixtureCreator).signature);
  });
});

describe("profile search into the shared catalogue", () => {
  it("adds the profile's new calls to a public catalogue under MECENA_DATA_DIR and records them for that profile only", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    const { ai, spy } = countingAi();
    const state = await runProfileSearch({ profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID }, opts(stubFetch([laracha, icaa, directAward]), ai));

    expect(state?.status).toBe("done");
    expect(state?.callIds.sort()).toEqual(["bdns-939879", "bdns-941955"]);
    expect(spy).toHaveBeenCalledTimes(2); // the direct award is dropped before Claude

    // shared catalogue: its own file under the data dir (not db.json, not the read-only calls dir), public data only
    const file = liveCallsFile();
    expect(file.startsWith(process.env.MECENA_DATA_DIR!)).toBe(true);
    const raw = fs.readFileSync(file, "utf8");
    expect(raw).not.toContain(DEMO_CREATOR_ID);
    expect(raw).not.toContain(DEMO_APP_USER_ID);
    expect(raw).not.toContain("ilustración"); // the profile's query never reaches the shared file
    expect(readCatalog().every((c) => c.source === "bdns")).toBe(true);
    expect(fs.existsSync(path.join(process.env.MECENA_CALLS_DIR!, "bdns-cache.json"))).toBe(false);

    // the feed merges it after the seed
    expect(listCalls().map((c) => c.id)).toEqual(expect.arrayContaining(["fixture-beca-artes-plasticas", "bdns-939879", "bdns-941955"]));

    // personal state: keyed by profile, readable only by its owner
    expect(getProfileSearch(DEMO_CREATOR_ID, DEMO_APP_USER_ID)?.callIds).toHaveLength(2);
    expect(getProfileSearch(DEMO_CREATOR_ID, "someone-else")).toBeUndefined();
  });

  it("never structures a call twice: cached, curated or in-flight calls skip Claude", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    const first = countingAi();
    await runProfileSearch({ profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID }, opts(stubFetch([laracha]), first.ai));
    expect(first.spy).toHaveBeenCalledTimes(1);

    const again = countingAi();
    const seen: string[] = [];
    const r = await runProfileSearch({ profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID }, opts(stubFetch([laracha], seen), again.ai));
    expect(again.spy).not.toHaveBeenCalled();
    expect(seen.some((u) => u.includes("numConv="))).toBe(false); // not even the BDNS detail is fetched again
    expect(r?.callIds).toEqual(["bdns-939879"]);

    // a call the curated seed already has (by BDNS code) is never structured either
    const curated = { ...fixtureCalls[0], id: "curated-icaa", bdnsId: "941955" };
    fs.writeFileSync(path.join(process.env.MECENA_CALLS_DIR!, "calls.json"), JSON.stringify([...fixtureCalls, curated]));
    const third = countingAi();
    const r3 = await ingestIntoCatalog({ ...opts(stubFetch([icaa]), third.ai), queries: [{ query: { descripcion: "cine" }, regions: [] }], maxNew: 5 });
    expect(third.spy).not.toHaveBeenCalled();
    expect(r3.found).toEqual(["curated-icaa"]);

    // two concurrent searches finding the same new call pay Claude once
    const both = countingAi();
    const code = { ...icaa, codigoBDNS: "777001" };
    await Promise.all([
      ingestIntoCatalog({ ...opts(stubFetch([code]), both.ai), queries: [{ query: { descripcion: "a" }, regions: [] }], maxNew: 5 }),
      ingestIntoCatalog({ ...opts(stubFetch([code]), both.ai), queries: [{ query: { descripcion: "b" }, regions: [] }], maxNew: 5 }),
    ]);
    expect(both.spy).toHaveBeenCalledTimes(1);
  });

  it("caps Claude structurings per run and keeps calls outside the profile's region out", async () => {
    const { ai, spy } = countingAi();
    const many = Array.from({ length: 5 }, (_, i) => ({ ...icaa, codigoBDNS: `88800${i}` }));
    const r = await ingestIntoCatalog({ ...opts(stubFetch([...many, laracha]), ai), queries: [{ query: { descripcion: "cine" }, regions: ["ES52"] }], maxNew: 2 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(r.skipped.filter((s) => /tope/.test(s.reason))).toHaveLength(3);
    expect(r.skipped.find((s) => s.bdnsId === "939879")?.reason).toMatch(/fuera de la zona/); // A Coruña call, Valencian profile
  });

  it("the curated seed wins an id clash with the live catalogue", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    await runProfileSearch({ profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID }, opts(stubFetch([laracha])));
    expect(readCatalog().map((c) => c.id)).toEqual(["bdns-939879"]);
    const curated = { ...fixtureCalls[0], id: "bdns-939879", title: "Curada a mano" };
    fs.writeFileSync(path.join(process.env.MECENA_CALLS_DIR!, "calls.json"), JSON.stringify([...fixtureCalls, curated]));
    const hits = listCalls().filter((c) => c.id === "bdns-939879");
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Curada a mano");
    expect(hits[0].source).toBe("seed");
  });
});

describe("failures never break the feed", () => {
  it("a BDNS outage leaves the catalogue untouched and marks the profile search failed", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    await runProfileSearch({ profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID }, opts(stubFetch([laracha])));
    const before = fs.readFileSync(liveCallsFile(), "utf8");
    const failing = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const state = await runProfileSearch({ profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID }, opts(failing));
    expect(state?.status).toBe("failed");
    expect(state?.error).toMatch(/ECONNRESET/);
    expect(fs.readFileSync(liveCallsFile(), "utf8")).toBe(before);
    expect((await searchCalls({ profileId: DEMO_CREATOR_ID, now: new Date(FIXTURE_NOW) })).length).toBeGreaterThan(0);
  });

  it("a corrupt catalogue file is ignored instead of crashing listCalls", async () => {
    fs.mkdirSync(path.dirname(liveCallsFile()), { recursive: true });
    fs.writeFileSync(liveCallsFile(), "{ not json");
    expect(() => listCalls()).not.toThrow();
    expect(listCalls().map((c) => c.id)).toContain("fixture-beca-artes-plasticas");
  });

  it("a structuring failure is remembered so the same code does not cost Claude again for a week", async () => {
    const broken = { structureCall: vi.fn(async () => Promise.reject(new Error("refusal"))) } as unknown as Pick<AiService, "structureCall">;
    const q = { queries: [{ query: { descripcion: "x" }, regions: [] }], maxNew: 5 };
    await ingestIntoCatalog({ ...opts(stubFetch([icaa]), broken), ...q });
    await ingestIntoCatalog({ ...opts(stubFetch([icaa]), broken), ...q });
    expect(broken.structureCall).toHaveBeenCalledTimes(1);
  });
});

describe("scheduling", () => {
  it("is off when MECENA_CALLS_LIVE=0 (tests, CLI) and debounced/deduplicated when on", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    const ids = { profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID };
    expect(process.env.MECENA_CALLS_LIVE).toBe("0");
    expect(scheduleProfileSearch(ids)).toBe("disabled");

    const { ai, spy } = countingAi();
    const run = { ...opts(stubFetch([laracha])), ai, enabled: true, debounceMs: 0, log: () => {} };
    expect(scheduleProfileSearch(ids, run)).toBe("scheduled");
    await vi.waitFor(() => expect(getProfileSearch(DEMO_CREATOR_ID, DEMO_APP_USER_ID)?.status).toBe("done"));
    expect(spy).toHaveBeenCalledTimes(1);
    // same profile data within 24 h: nothing to do
    expect(scheduleProfileSearch(ids, run)).toBe("fresh");
  });
});

describe("daily refresh of the shared catalogue", () => {
  it("prunes expired calls and records the refresh; refreshIfDue waits 23 h between runs", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    await runProfileSearch({ profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID }, opts(stubFetch([laracha, icaa])));
    expect(readCatalog()).toHaveLength(2);
    expect(await pruneCatalog("2027-01-10")).toBe(1); // A Laracha closes 2026-12-07 (estimated); ICAA on 2027-04-16
    expect(readCatalog().map((c) => c.id)).toEqual(["bdns-941955"]);

    const r = await refreshCatalog({ ...opts(stubFetch([icaa])), log: () => {} });
    expect(r.ok).toBe(true);
    expect(r.queries).toBeGreaterThan(5); // defaults + the creator's own searches

    const run = vi.fn(async () => ({ ok: true, found: [], structured: 0, skipped: [], pruned: 0, queries: 0 }));
    expect(await refreshIfDue(Date.now(), run)).toBe(false); // just refreshed
    expect(await refreshIfDue(Date.now() + 24 * 3600e3, run)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("feed integration", () => {
  it("GET /api/calls reports the profile's background search and shows its calls, only to the owner", async () => {
    const { GET } = await import("@/app/api/calls/route");
    const { loginDemo, createUser, req } = await import("../helpers");
    await loginDemo(); // owns demo-creator, RevenueCat id DEMO_APP_USER_ID
    await saveProfile(structuredClone(fixtureCreator));
    await runProfileSearch({ profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID }, opts(stubFetch([laracha, icaa])));
    const body = await (await GET(req(`/api/calls?profileId=${DEMO_CREATOR_ID}`))).json();
    expect(body.liveSearch).toEqual({ searching: false, found: 2, lastRunAt: expect.any(String) });
    expect(body.results.map((r: { call: { id: string } }) => r.call.id)).toEqual(expect.arrayContaining(["bdns-939879"]));
    const intruder = await createUser("otra@mecena.test");
    const other = await GET(req(`/api/calls?profileId=${DEMO_CREATOR_ID}`, { cookie: intruder.cookie }));
    expect(other.status).toBe(404); // another account's profile does not exist for them
  });
});

describe("review fixes: no hammering, no double spend, strict owner", () => {
  const ids = { profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID };
  const metaFile = () => liveCallsFile().replace(/\.json$/, ".meta.json");

  it("a feed reloading every few seconds does not keep postponing the debounced search", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const run = { ...opts(stubFetch([laracha])), enabled: true, debounceMs: 1000, log: () => {} };
      expect(scheduleProfileSearch(ids, run)).toBe("scheduled");
      await vi.advanceTimersByTimeAsync(600);
      expect(scheduleProfileSearch(ids, run)).toBe("scheduled"); // same searches: the timer is kept
      await vi.advanceTimersByTimeAsync(500); // 1100 ms after the first call: it fires
      for (let i = 0; i < 20 && getProfileSearch(ids.profileId, ids.appUserId)?.status !== "done"; i++) await vi.advanceTimersByTimeAsync(10);
      expect(getProfileSearch(ids.profileId, ids.appUserId)?.status).toBe("done");
    } finally {
      vi.useRealTimers();
    }
  });

  it("after a failed search, BDNS is left alone for an hour", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    const failing = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    await runProfileSearch(ids, opts(failing));
    expect(scheduleProfileSearch(ids, { enabled: true, debounceMs: 0 })).toBe("cooldown");
  });

  it("another user can neither take over nor overwrite a profile's search state", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    await runProfileSearch(ids, opts(stubFetch([laracha])));
    expect(scheduleProfileSearch({ ...ids, appUserId: "intruder" }, { enabled: true, debounceMs: 0 })).toBe("not-owner");
    expect(await runProfileSearch({ ...ids, appUserId: "intruder" }, opts(stubFetch([icaa])))).toBeUndefined();
    expect(getProfileSearch(ids.profileId, ids.appUserId)?.callIds).toEqual(["bdns-939879"]);
  });

  it("a call pruned as expired, or whose derived deadline already passed, is never sent to Claude", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    await runProfileSearch(ids, opts(stubFetch([laracha])));
    await pruneCatalog("2027-01-10"); // A Laracha's estimated deadline (2026-12-07) has passed
    const later = countingAi();
    const q = { queries: [{ query: { descripcion: "x" }, regions: ["ES11"] }], maxNew: 5 };
    const r = await ingestIntoCatalog({ ...opts(stubFetch([laracha]), later.ai), ...q, today: "2026-11-20" });
    expect(later.spy).not.toHaveBeenCalled();
    expect(r.skipped[0].reason).toMatch(/caducó/);

    const lapsed = { ...icaa, codigoBDNS: "555001", abierto: true, fechaFinSolicitud: "2026-10-01" }; // flagged open, date passed
    const r2 = await ingestIntoCatalog({ ...opts(stubFetch([lapsed]), later.ai), ...q });
    expect(later.spy).not.toHaveBeenCalled();
    expect(r2.skipped[0].reason).toMatch(/plazo estimado vencido/);
  });

  it("a daily ceiling on Claude structurings holds across runs", async () => {
    fs.mkdirSync(path.dirname(metaFile()), { recursive: true });
    fs.writeFileSync(metaFile(), JSON.stringify({ failed: {}, expired: {}, spend: { day: TODAY, structured: 100 } }));
    const { ai, spy } = countingAi();
    const r = await ingestIntoCatalog({ ...opts(stubFetch([icaa]), ai), queries: [{ query: { descripcion: "x" }, regions: [] }], maxNew: 5 });
    expect(spy).not.toHaveBeenCalled();
    expect(r.skipped[0].reason).toMatch(/tope diario/);
  });

  it("the daily refresh sends each distinct search once and skips profiles idle for a month", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    await runProfileSearch(ids, opts(stubFetch([])));
    const twin = { ...structuredClone(fixtureCreator), id: "twin" };
    await saveProfile(twin);
    await runProfileSearch({ profileId: "twin", appUserId: "other-user" }, opts(stubFetch([])));
    const seen: string[] = [];
    const r = await refreshCatalog({ ...opts(stubFetch([], seen)), log: () => {} });
    const searches = seen.filter((u) => u.includes("/busqueda")).map((u) => new URL(u).searchParams.toString());
    expect(new Set(searches).size).toBe(searches.length);
    expect(r.queries).toBe(searches.length);
  });
});

describe("review fixes: resilience", () => {
  it("one failing BDNS search does not sink the others", async () => {
    let n = 0;
    const base = stubFetch([icaa]);
    const flaky = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("descripcion=roto")) {
        n++;
        throw new Error("ECONNRESET");
      }
      return base(input, init);
    }) as typeof fetch;
    const r = await ingestIntoCatalog({ ...opts(flaky), queries: [{ query: { descripcion: "roto" }, regions: [] }, { query: { descripcion: "cine" }, regions: [] }], maxNew: 5 });
    expect(r.ok).toBe(true);
    expect(r.found).toEqual(["bdns-941955"]);
    expect(n).toBe(3); // network errors are retried twice before giving up on that search
  });

  it("a curated call is not repeated by its live BDNS copy", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    await runProfileSearch({ profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID }, opts(stubFetch([laracha])));
    const curated = { ...fixtureCalls[0], id: "a-laracha-concurso-fotografia-2026", bdnsId: "939879" };
    fs.writeFileSync(path.join(process.env.MECENA_CALLS_DIR!, "calls.json"), JSON.stringify([...fixtureCalls, curated]));
    const ids = listCalls().map((c) => c.id);
    expect(ids).toContain("a-laracha-concurso-fotografia-2026");
    expect(ids).not.toContain("bdns-939879");
  });
});

describe("review fixes: no placeholder data in the shared catalogue", () => {
  it("without a Claude key the live catalogue stays off unless forced (mock data would be cached for good)", async () => {
    const { liveCatalogEnabled } = await import("@/features/calls-ingest/live");
    const prev = process.env.MECENA_CALLS_LIVE;
    try {
      delete process.env.MECENA_CALLS_LIVE;
      expect(liveCatalogEnabled()).toBe(false); // tests run on AI mocks
      process.env.MECENA_CALLS_LIVE = "1";
      expect(liveCatalogEnabled()).toBe(true);
    } finally {
      process.env.MECENA_CALLS_LIVE = prev;
    }
  });
});
