import { describe, expect, it } from "vitest";
import type { Call } from "@/contracts";
import { DEMO_APP_USER_ID, DEMO_BUSINESS_ID, DEMO_CREATOR_ID, fixtureCalls } from "@/fixtures";
import { draftApplication } from "@/features/drafting/service";
import { allocate } from "@/features/jury/rules";
import { BUSINESS_JUDGES, CREATOR_JUDGES, improveApplication, scoreApplication } from "@/features/jury/service";
import { getApplication } from "@/server/store";
import { grantPro, seedOnboardedCreator } from "../helpers";

async function draft(callId: string, profileId: string) {
  await grantPro();
  return draftApplication({ callId, profileId }, { caller: "app", appUserId: DEMO_APP_USER_ID });
}

describe("simulated jury (mock)", () => {
  it("creator: 61 → 84 after one improvement, with creator personas", async () => {
    await seedOnboardedCreator();
    const app = await draft("fixture-beca-artes-plasticas", DEMO_CREATOR_ID);
    const s1 = await scoreApplication(app.id);
    expect(s1.total).toBe(61);
    expect(s1.judges).toEqual(CREATOR_JUDGES);
    expect(s1.disclaimer).toMatch(/orientativa/);

    const weak = s1.criteria.filter((c) => c.fixes.length);
    expect(weak.length).toBeGreaterThan(0);
    for (const c of s1.criteria) {
      expect(c.byJudge).toHaveLength(3);
      expect(c.points).toBeLessThanOrEqual(c.maxPoints);
      expect(c.byJudge.every((j) => j.comment.length > 0)).toBe(true);
    }

    const { application, score, previous } = await improveApplication({ applicationId: app.id, scoreId: s1.id });
    expect(previous?.total).toBe(61);
    expect(score.total).toBe(84);
    expect(application.version).toBe(2);
    expect(application.status).toBe("reviewed");
    // the revision visibly changed the draft, using facts already present
    expect(application.sections.find((s) => s.key === "memoria")!.body).not.toBe(app.sections.find((s) => s.key === "memoria")!.body);
  });

  it("business: 61 → 84 with business personas", async () => {
    const app = await draft("fixture-digitalizacion-pymes", DEMO_BUSINESS_ID);
    const s1 = await scoreApplication(app.id);
    expect(s1.total).toBe(61);
    expect(s1.judges).toEqual(BUSINESS_JUDGES);
    const { score } = await improveApplication({ applicationId: app.id, scoreId: s1.id });
    expect(score.total).toBe(84);
  });

  it("editing the draft (PATCH bumps version) does not fake the improvement", async () => {
    await seedOnboardedCreator();
    const app = await draft("fixture-beca-artes-plasticas", DEMO_CREATOR_ID);
    const { saveApplication } = await import("@/server/store");
    await saveApplication({ ...app, version: 3 });
    expect((await scoreApplication(app.id)).total).toBe(61);
    expect(getApplication(app.id).version).toBe(3);
  });

  it("calls without scored criteria use estimated ones and say so", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const noCriteria: Call = { ...fixtureCalls[0], id: "fixture-sin-criterios", criteria: [], criteriaSource: "estimated" };
    fs.writeFileSync(path.join(process.env.MECENA_CALLS_DIR!, "calls.json"), JSON.stringify([...fixtureCalls, noCriteria]));
    await seedOnboardedCreator();
    const app = await draft("fixture-sin-criterios", DEMO_CREATOR_ID);
    const s = await scoreApplication(app.id);
    expect(s.criteria.length).toBe(3);
    expect(s.total).toBe(61);
    expect(s.disclaimer).toMatch(/criterios estimados/);
    expect(s.estimated).toBe(true);
  });

  it("criteria marked estimated in the call data are never presented as the bases' official ones", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const guessed: Call = { ...fixtureCalls[0], id: "fixture-estimados", criteriaSource: "estimated" };
    fs.writeFileSync(path.join(process.env.MECENA_CALLS_DIR!, "calls.json"), JSON.stringify([...fixtureCalls, guessed]));
    await seedOnboardedCreator();
    const app = await draft("fixture-estimados", DEMO_CREATOR_ID);
    const s = await scoreApplication(app.id);
    expect(s.criteria.map((c) => c.criterionId)).toEqual(guessed.criteria.map((c) => c.id)); // its own (estimated) criteria
    expect(s.estimated).toBe(true);
    expect(s.disclaimer).toMatch(/criterios estimados/);
    expect(s.disclaimer).not.toMatch(/publicados en las bases/);

    const official = await scoreApplication((await draft("fixture-premio-ilustracion", DEMO_CREATOR_ID)).id);
    expect(official.estimated).toBe(false);
    expect(official.disclaimer).toMatch(/publicados en las bases/);
  });

  it("judges differ a little per criterion but the panel average still hits 61 and 84 exactly", async () => {
    await seedOnboardedCreator();
    const app = await draft("fixture-beca-artes-plasticas", DEMO_CREATOR_ID);
    const s1 = await scoreApplication(app.id);
    expect(s1.criteria.some((c) => new Set(c.byJudge.map((j) => j.points)).size > 1)).toBe(true);
    for (const c of s1.criteria) for (const j of c.byJudge) expect(j.points).toBeGreaterThanOrEqual(0), expect(j.points).toBeLessThanOrEqual(c.maxPoints);
    expect(s1.total).toBe(61);
  });

  it("visual criteria are flagged as judged from the written application", async () => {
    await seedOnboardedCreator();
    const s = await scoreApplication((await draft("fixture-premio-ilustracion", DEMO_CREATOR_ID)).id);
    expect(s.criteria.find((c) => c.criterionId === "originalidad")?.writtenOnly).toBe(true);
    const beca = await scoreApplication((await draft("fixture-beca-artes-plasticas", DEMO_CREATOR_ID)).id);
    expect(beca.criteria.find((c) => c.criterionId === "territorio")?.writtenOnly).toBeUndefined();
  });
});

describe("allocate", () => {
  it("hits the target exactly for odd totals", () => {
    for (const maxes of [[40, 40, 20], [50, 50], [10, 10, 10], [45, 5, 8, 3, 8, 1, 5], [4, 2.5, 3, 0.5]]) {
      const criteria = maxes.map((m, i) => ({ id: `c${i}`, name: `c${i}`, description: "", maxPoints: m }));
      const max = maxes.reduce((s, m) => s + m, 0);
      for (const target of [61, 84]) {
        const pts = allocate(criteria, target);
        pts.forEach((p, i) => expect(p).toBeLessThanOrEqual(maxes[i]));
        expect(Math.round((pts.reduce((s, p) => s + p, 0) / max) * 100), `${maxes} → ${target}`).toBe(target);
      }
    }
  });
});
