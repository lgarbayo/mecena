import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as getCalls } from "@/app/api/calls/route";
import { GET as getCall } from "@/app/api/calls/[id]/route";
import { FREE_MATCHES_PER_MONTH } from "@/contracts";
import { DEMO_APP_USER_ID, DEMO_BUSINESS_ID, DEMO_CREATOR_ID, fixtureCalls, fixtureCreator } from "@/fixtures";
import { saveProfile } from "@/server/store";
import { ctx, grantPro, req, seedOnboardedCreator, loginDemo } from "../helpers";

// 6 eligible creator calls (clones of the fictional beca) + the 3 fixtures, so the free limit kicks in.
beforeEach(() => {
  const beca = fixtureCalls[0];
  const extra = Array.from({ length: 4 }, (_, i) => ({ ...beca, id: `fixture-beca-extra-${i + 1}`, title: `[FIXTURE] Beca extra ${i + 1}`, amountEur: { max: 1000 * (i + 1) } }));
  fs.writeFileSync(path.join(process.env.MECENA_CALLS_DIR!, "calls.json"), JSON.stringify([...fixtureCalls, ...extra]));
});

// Route handlers need a session: run as the demo account (owns the fixture profiles).
beforeEach(async () => {
  await loginDemo();
});

describe("GET /api/calls", () => {
  it("free plan: top 3 unlocked, the rest only as lockedCount", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    const body = await (await getCalls(req(`/api/calls?profileId=${DEMO_CREATOR_ID}&appUserId=${DEMO_APP_USER_ID}`))).json();
    expect(body.mode).toBe("creator");
    expect(body.results).toHaveLength(FREE_MATCHES_PER_MONTH);
    expect(body.lockedCount).toBe(3); // 6 eligible - 3 visible
    expect(body.results.every((r: { match: { eligible: boolean } }) => r.match.eligible)).toBe(true);
    const ids = body.results.map((r: { call: { id: string } }) => r.call.id);
    expect(ids).not.toContain("fixture-digitalizacion-pymes");
  });

  it("Pro sees every match", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    await grantPro();
    const body = await (await getCalls(req(`/api/calls?profileId=${DEMO_CREATOR_ID}&appUserId=${DEMO_APP_USER_ID}`))).json();
    expect(body.results).toHaveLength(6);
    expect(body.lockedCount).toBe(0);
  });

  it("business mode ranks business calls first; creator calls an autónomo may enter rank low", async () => {
    const body = await (await getCalls(req(`/api/calls?profileId=${DEMO_BUSINESS_ID}`))).json();
    expect(body.mode).toBe("business");
    const results = body.results as { call: { id: string; beneficiaryKinds: string[] }; match: { score: number } }[];
    expect(results[0].call.id).toBe("fixture-digitalizacion-pymes");
    for (const r of results.filter((x) => !x.call.beneficiaryKinds.includes("business"))) expect(r.match.score, r.call.id).toBeLessThan(60);
  });
});

describe("GET /api/calls/[id]", () => {
  it("returns fit, visible breakdown, checklist with what the user already has, and no awards when none exist", async () => {
    await seedOnboardedCreator(); // profile + 2 works
    const res = await getCall(req(`/api/calls/fixture-beca-artes-plasticas?profileId=${DEMO_CREATOR_ID}`), ctx({ id: "fixture-beca-artes-plasticas" }));
    const body = await res.json();
    expect(body.call.id).toBe("fixture-beca-artes-plasticas");
    expect(body.match.eligible).toBe(true);
    const b = body.breakdown;
    expect(b.base + b.affinity + b.documents + b.amount + b.timing).toBe(body.match.score);
    const done = Object.fromEntries(body.checklistItems.map((c: { item: string; done: boolean }) => [c.item, c.done]));
    expect(done["Dossier artístico (máx. 10 imágenes)"]).toBe(true); // works exist
    expect(done["Certificados de Hacienda y Seguridad Social"]).toBe(false);
    expect(body.similarAwards).toEqual([]);
  });

  it("404 for an unknown call", async () => {
    const res = await getCall(req(`/api/calls/nope`), ctx({ id: "nope" }));
    expect(res.status).toBe(404);
  });
});

describe("free plan: 3 matches a month, counted for real", () => {
  const feed = async (q = "") => (await getCalls(req(`/api/calls?profileId=${DEMO_CREATOR_ID}${q}`))).json();
  const detail = async (id: string) => (await getCall(req(`/api/calls/${id}?profileId=${DEMO_CREATOR_ID}`), ctx({ id }))).json();

  it("the detail of a call beyond the 3 unlocked ones is a limited preview with the match_limit paywall", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    const body = await feed();
    const shown = new Set(body.results.map((r: { call: { id: string } }) => r.call.id));
    const hidden = ["fixture-beca-extra-1", "fixture-beca-extra-2", "fixture-beca-extra-3", "fixture-beca-extra-4", "fixture-beca-artes-plasticas"].find((id) => !shown.has(id));
    expect(hidden).toBeTruthy();
    const d = await detail(hidden!);
    expect(d.locked).toBe(true);
    expect(d.paywall).toBe("match_limit");
    expect(d.match.whyYouFit).toEqual([]);
    expect(d.checklistItems).toEqual([]);
    // an unlocked one stays complete, and opening it again does not use another place
    const ok = await detail([...shown][0] as string);
    expect(ok.locked).toBe(false);
    expect((await feed()).results).toHaveLength(FREE_MATCHES_PER_MONTH);
  });

  it("a ?q= search cannot be used to get more than 3 full matches", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    await feed();
    const q = await feed("&q=beca");
    expect(q.results.length).toBeLessThanOrEqual(FREE_MATCHES_PER_MONTH);
  });

  it("Pro sees every detail in full", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    await grantPro();
    const d = await detail("fixture-beca-extra-4");
    expect(d.locked).toBe(false);
  });

  it("the same count lives in db.usage and resets with the month", async () => {
    const { readDb } = await import("@/server/store");
    const { unlockCalls, monthKey } = await import("@/features/matching/usage");
    const who = { appUserId: "u1", profileId: "p1", now: new Date("2026-11-14T10:00:00Z") };
    const first = await unlockCalls(who, ["a", "b", "c", "d"]);
    expect([...first]).toEqual(["a", "b", "c"]);
    expect(readDb().usage.find((u) => u.appUserId === "u1")?.callIds).toEqual(["a", "b", "c"]);
    expect([...(await unlockCalls(who, ["d"]))]).toEqual(["a", "b", "c"]);
    const december = await unlockCalls({ ...who, now: new Date("2026-12-02T10:00:00Z") }, ["d"]);
    expect([...december]).toEqual(["d"]);
    expect(monthKey(who.now)).toBe("2026-11");
  });
});
