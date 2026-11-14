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
