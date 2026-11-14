import { describe, expect, it, beforeEach } from "vitest";
import { GET as getApps, POST as postApp } from "@/app/api/applications/route";
import { GET as getApp, PATCH as patchApp } from "@/app/api/applications/[id]/route";
import { GET as getJury, POST as postJury } from "@/app/api/jury/route";
import { POST as postImprove } from "@/app/api/jury/improve/route";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID } from "@/fixtures";
import { ctx, grantPro, req, seedOnboardedCreator, loginDemo } from "../helpers";

const CALL = "fixture-beca-artes-plasticas";

// Route handlers need a session: run as the demo account (owns the fixture profiles).
beforeEach(async () => {
  await loginDemo();
});

describe("demo beats 6-7 through the API", () => {
  it("402 → Pro → draft (with sources) → reload without re-drafting → jury 61 → improve 84", async () => {
    await seedOnboardedCreator();
    const body = { callId: CALL, profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID };

    expect((await (await getApps(req(`/api/applications?callId=${CALL}&profileId=${DEMO_CREATOR_ID}`))).json()).application).toBeNull();
    expect((await postApp(req("/api/applications", { body }))).status).toBe(402);

    await grantPro();
    const created = await postApp(req("/api/applications", { body }));
    expect(created.status).toBe(201);
    const { application, sources } = await created.json();
    expect(Object.values(sources).length).toBeGreaterThan(0);

    const reloaded = await (await getApps(req(`/api/applications?callId=${CALL}&profileId=${DEMO_CREATOR_ID}`))).json();
    expect(reloaded.application.id).toBe(application.id);

    expect((await (await getJury(req(`/api/jury?applicationId=${application.id}`))).json()).score).toBeNull();
    const s1 = (await (await postJury(req("/api/jury", { body: { applicationId: application.id } }))).json()).score;
    expect(s1.total).toBe(61);

    const improved = await (await postImprove(req("/api/jury/improve", { body: { applicationId: application.id, scoreId: s1.id } }))).json();
    expect(improved.previous.total).toBe(61);
    expect(improved.score.total).toBe(84);
    expect(improved.application.version).toBe(2);
  });

  it("PATCH keeps the user's text and drops budget lines the bases do not allow", async () => {
    await seedOnboardedCreator();
    await grantPro();
    const { application } = await (await postApp(req("/api/applications", { body: { callId: CALL, profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID } }))).json();
    const sections = application.sections.map((s: { key: string; body: string }) => (s.key === "memoria" ? { ...s, body: "Mi texto, a mi manera." } : s));
    const budget = [
      { concept: "Papel", amountEur: 500, expenseType: "materiales" },
      { concept: "Coche", amountEur: 9000, expenseType: "vehículos" },
    ];
    const res = await patchApp(req(`/api/applications/${application.id}`, { method: "PATCH", body: { sections, budget } }), ctx({ id: application.id }));
    const patched = (await res.json()).application;
    expect(patched.sections.find((s: { key: string }) => s.key === "memoria").body).toBe("Mi texto, a mi manera.");
    expect(patched.budget).toEqual([{ concept: "Papel", amountEur: 500, expenseType: "materiales" }]);
    expect(patched.version).toBe(2);
    const read = await (await getApp(req(`/api/applications/${application.id}`), ctx({ id: application.id }))).json();
    expect(read.application.version).toBe(2);
  });
});
