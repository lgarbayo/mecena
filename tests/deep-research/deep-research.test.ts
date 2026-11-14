import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/calls/research/route";
import type { DeepResearchCandidate, Profile } from "@/contracts";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID, fixtureCreator } from "@/fixtures";
import { deepResearchAi, extractJson } from "@/features/deep-research/ai";
import { candidatesToCalls, DEEP_RESEARCH_LIMITS, getDeepResearch, startDeepResearch } from "@/features/deep-research/service";
import { resetUserDemo } from "@/features/demo/service";
import { dataDir, readDb, saveProfile } from "@/server/store";
import { createUser, grantPro, loginDemo, req } from "../helpers";

const ids = { profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const plus = (days: number) => new Date(Date.parse(today) + days * 864e5).toISOString().slice(0, 10);

const cand = (over: Partial<DeepResearchCandidate> = {}): DeepResearchCandidate => ({
  title: "Premio de ilustración de la Fundación X",
  organizer: "Fundación X",
  type: "premio",
  url: "https://fundacionx.org/premio",
  deadline: plus(20),
  deadlineText: "",
  amountText: "2.000 €",
  summary: "Premio para ilustradoras.",
  disciplines: ["ilustración"],
  beneficiaryKinds: ["creator"],
  region: null,
  requirements: [],
  ...over,
});

/** The demo account (owns demo-creator, RevenueCat id DEMO_APP_USER_ID) signed in, with its creator onboarded. */
async function onboarded(): Promise<Profile> {
  await loginDemo();
  return saveProfile(structuredClone(fixtureCreator));
}

describe("candidate validation (code decides, not Claude)", () => {
  it("keeps valid calls as unverified 'web' calls and drops no URL, invented sites, past or malformed deadlines, duplicates and known calls", () => {
    const { calls, discarded } = candidatesToCalls(
      [
        cand(),
        cand({ url: "" }),
        cand({ url: "ftp://fundacionx.org/x" }),
        cand({ url: "https://invented-by-the-model.org/premio" }), // never came up in the search
        cand({ url: "https://fundacionx.org/otro", deadline: plus(-1) }),
        cand({ url: "https://fundacionx.org/otro2", deadline: "15/12/2026" }),
        cand({ url: "https://fundacionx.org/otro3", deadline: "2026-11-31" }), // no such day
        cand({ url: "https://fundacionx.org/premio/" }), // same page as the first
        cand({ url: "https://www.fundacionx.org/ya-en-mecena" }),
        cand({ url: "https://fundacionx.org/sin-plazo", deadline: null, title: "Beca sin plazo publicado" }),
      ],
      { today, sourceUrls: ["https://www.fundacionx.org/convocatorias"], knownUrls: ["https://www.fundacionx.org/ya-en-mecena"] },
    );
    expect(calls.map((c) => c.sourceUrl)).toEqual(["https://fundacionx.org/premio", "https://fundacionx.org/sin-plazo"]);
    expect(discarded).toBe(8);
    expect(calls[0]).toMatchObject({ source: "web", scope: "privado", status: "open", criteriaSource: "estimated", disciplines: ["ilustracion"] });
    expect(calls[0].id).toMatch(/^web-[0-9a-f]{12}$/);
  });

  it("the mock is deterministic and offline", async () => {
    const input = { profile: fixtureCreator, today, maxSearches: 3, maxOutputTokens: 1000, maxTotalTokens: 1000 };
    expect(await deepResearchAi.mock.deepResearch(input)).toEqual(await deepResearchAi.mock.deepResearch(input));
  });

  it("extracts the JSON object from a final answer wrapped in prose or a code fence", () => {
    expect(extractJson('Aquí tienes:\n```json\n{"candidates":[]}\n```')).toEqual({ candidates: [] });
    expect(extractJson('{"candidates":[{"a":1}]} fin')).toEqual({ candidates: [{ a: 1 }] });
    expect(extractJson("nada")).toBeUndefined();
  });
});

describe("POST/GET /api/calls/research", () => {
  it("is Pro only", async () => {
    await onboarded();
    const post = await POST(req("/api/calls/research", { body: { profileId: DEMO_CREATOR_ID } }));
    expect(post.status).toBe(402);
    const get = await GET(req(`/api/calls/research?profileId=${DEMO_CREATOR_ID}`));
    expect(get.status).toBe(402);
    expect((await GET(req(`/api/calls/research?profileId=${DEMO_CREATOR_ID}`, { cookie: null }))).status).toBe(401); // no session
  });

  it("runs in the background and shows only validated, eligible results, scored by the rules", async () => {
    await onboarded();
    await grantPro();
    const res = await POST(req("/api/calls/research", { body: { profileId: DEMO_CREATOR_ID, appUserId: "ignored" } }));
    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe("running");

    await vi.waitFor(async () => expect((await getDeepResearch(ids)).status).toBe("done"));
    const body = await (await GET(req(`/api/calls/research?profileId=${DEMO_CREATOR_ID}`))).json();
    expect(body.results).toHaveLength(1); // the mock's closed call and the one without URL are discarded
    expect(body.discarded).toBe(2);
    const [{ call, match }] = body.results;
    expect(call.source).toBe("web");
    expect(call.title).toMatch(/\[MOCK\]/);
    expect(match.eligible).toBe(true);
    expect(match.generatedBy).toBe("rules");

    // kept apart: never in the shared catalogue nor in db.json
    expect(fs.existsSync(path.join(dataDir(), "deep-research.json"))).toBe(true);
    expect(JSON.stringify(readDb())).not.toContain(call.id);
  });

  it("caches per profile: the same profile data within a week does not run again; new profile data does, up to the monthly cap", async () => {
    await onboarded();
    await grantPro();
    const spy = vi.spyOn(deepResearchAi.mock, "deepResearch");
    await (await startDeepResearch(ids)).job;
    const again = await startDeepResearch(ids);
    expect(again.job).toBeUndefined();
    expect(again.view.status).toBe("done");
    expect(again.view.message).toMatch(/Podrás repetirlo a partir del/); // the button is not a silent no-op
    expect(again.view.freshUntil).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);

    for (let i = 1; i < DEEP_RESEARCH_LIMITS.runsPerProfilePerMonth; i++) {
      await saveProfile({ ...structuredClone(fixtureCreator), projectIdea: `Proyecto ${i}` });
      await (await startDeepResearch(ids)).job;
    }
    expect(spy).toHaveBeenCalledTimes(DEEP_RESEARCH_LIMITS.runsPerProfilePerMonth);
    await saveProfile({ ...structuredClone(fixtureCreator), projectIdea: "Otro proyecto más" });
    const limited = await startDeepResearch(ids);
    expect(limited.view.status).toBe("limited");
    expect(limited.job).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(DEEP_RESEARCH_LIMITS.runsPerProfilePerMonth);
    spy.mockRestore();
  });

  it("a signed-in user can neither see nor start another user's deep research", async () => {
    await onboarded();
    await grantPro();
    await (await startDeepResearch(ids)).job;

    const intruder = await createUser("intrusa@mecena.test");
    await grantPro(intruder.user.appUserId); // even a Pro user
    const spy = vi.spyOn(deepResearchAi.mock, "deepResearch");
    const peek = await GET(req(`/api/calls/research?profileId=${DEMO_CREATOR_ID}`, { cookie: intruder.cookie }));
    expect(peek.status).toBe(404);
    const start = await POST(req("/api/calls/research", { cookie: intruder.cookie, body: { profileId: DEMO_CREATOR_ID } }));
    expect(start.status).toBe(404);
    // nor by claiming the owner's RevenueCat id: the server only uses the session's
    const claim = await POST(req("/api/calls/research", { cookie: intruder.cookie, body: { profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID } }));
    expect(claim.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();

    // their own profile works, and shows nothing of the owner's
    const own = await (await GET(req("/api/calls/research", { cookie: intruder.cookie }))).json();
    expect(own.status).toBe("idle");
    expect(own.results).toEqual([]);
    // the service refuses a mismatched owner too (defence in depth)
    await expect(getDeepResearch({ profileId: DEMO_CREATOR_ID, appUserId: intruder.user.appUserId })).rejects.toThrow(/no encontrad|Búsqueda ampliada/i);
    expect((await getDeepResearch(ids)).results).toHaveLength(1); // the owner's results are untouched
  });

  it("a failing run is reported, not thrown, and the feed keeps working", async () => {
    await onboarded();
    await grantPro();
    const spy = vi.spyOn(deepResearchAi.mock, "deepResearch").mockRejectedValueOnce(new Error("overloaded"));
    const state = await (await startDeepResearch(ids)).job;
    expect(state?.status).toBe("failed");
    expect((await getDeepResearch(ids)).message).toMatch(/falló/);
    spy.mockRestore();
  });

  it("a user's demo reset forgets their deep research (and only theirs)", async () => {
    const { user } = await loginDemo();
    await onboarded();
    await grantPro();
    await (await startDeepResearch(ids)).job;
    const other = await createUser("otra@mecena.test");
    await grantPro(other.user.appUserId);
    const otherIds = { profileId: other.user.activeProfileId!, appUserId: other.user.appUserId };
    await (await startDeepResearch(otherIds)).job;

    const reset = await resetUserDemo(user, { scenario: "blank" });
    expect(JSON.parse(fs.readFileSync(path.join(dataDir(), "deep-research.json"), "utf8"))[DEMO_CREATOR_ID]).toBeUndefined();
    expect((await getDeepResearch(otherIds)).status).toBe("done");
    await grantPro(reset.appUserId);
    expect((await getDeepResearch({ profileId: reset.activeProfileId, appUserId: reset.appUserId })).status).toBe("idle");
  });
});

describe("review fixes", () => {
  it("concurrent POSTs start one run and record one use", async () => {
    await onboarded();
    await grantPro();
    const spy = vi.spyOn(deepResearchAi.mock, "deepResearch");
    const all = await Promise.all(Array.from({ length: 5 }, () => startDeepResearch(ids)));
    await Promise.all(all.map((r) => r.job));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir(), "deep-research-usage.json"), "utf8"))).toHaveLength(1);
    spy.mockRestore();
  });

  it("a run left 'running' by a restart is reported as interrupted and can be launched again", async () => {
    await onboarded();
    await grantPro();
    const file = path.join(dataDir(), "deep-research.json");
    fs.mkdirSync(dataDir(), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ [DEMO_CREATOR_ID]: { profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID, signature: "x", status: "running", startedAt: new Date().toISOString() } }));
    const v = await getDeepResearch(ids);
    expect(v.status).toBe("failed");
    expect(v.message).toMatch(/interrumpió/);
    const again = await startDeepResearch(ids);
    expect(again.job).toBeDefined();
    expect((await again.job)?.status).toBe("done");
  });

  it("a demo reset while a run is in flight drops its result and keeps the usage ledger (no refilled caps)", async () => {
    const { user } = await loginDemo();
    await onboarded();
    await grantPro();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const original = deepResearchAi.mock.deepResearch;
    const spy = vi.spyOn(deepResearchAi.mock, "deepResearch").mockImplementationOnce(async (input) => {
      await gate;
      return original(input);
    });
    const { job } = await startDeepResearch(ids);
    await resetUserDemo(user, { scenario: "blank" });
    release();
    expect(await job).toBeUndefined(); // dropped: that profile is gone
    expect(JSON.parse(fs.readFileSync(path.join(dataDir(), "deep-research.json"), "utf8"))[DEMO_CREATOR_ID]).toBeUndefined();
    const ledger = JSON.parse(fs.readFileSync(path.join(dataDir(), "deep-research-usage.json"), "utf8"));
    expect(ledger).toHaveLength(1); // still counts towards the daily ceiling
    spy.mockRestore();
  });
});
