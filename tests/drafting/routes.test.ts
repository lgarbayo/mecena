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

  it("PATCH keeps the user's text and rejects (never drops) budget lines the bases do not allow", async () => {
    await seedOnboardedCreator();
    await grantPro();
    const { application } = await (await postApp(req("/api/applications", { body: { callId: CALL, profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID } }))).json();
    const sections = application.sections.map((s: { key: string; body: string }) => (s.key === "memoria" ? { ...s, body: "Mi texto, a mi manera." } : s));
    const patch = (b: unknown) => patchApp(req(`/api/applications/${application.id}`, { method: "PATCH", body: b }), ctx({ id: application.id }));

    const bad = await patch({ sections, budget: [{ concept: "Papel", amountEur: 500, expenseType: "materiales" }, { concept: "Coche", amountEur: 900, expenseType: "vehículos" }] });
    expect(bad.status).toBe(400);
    expect((await bad.json()).message).toMatch(/no es un gasto admitido/);

    const over = await patch({ budget: [{ concept: "Papel", amountEur: 9000, expenseType: "materiales" }, { concept: "Imprenta", amountEur: 1000, expenseType: "materiales" }] });
    expect(over.status).toBe(400);
    expect((await over.json()).message).toMatch(/supera el máximo de 9\.000 €/);

    // nothing was changed by the rejected edits
    expect((await (await getApp(req(`/api/applications/${application.id}`), ctx({ id: application.id }))).json()).application.version).toBe(1);

    const res = await patch({ sections, budget: [{ concept: "Papel", amountEur: 500, expenseType: "materiales" }, { concept: "Imprenta", amountEur: 0, expenseType: "materiales" }] });
    const patched = (await res.json()).application;
    expect(patched.sections.find((s: { key: string }) => s.key === "memoria").body).toBe("Mi texto, a mi manera.");
    expect(patched.budget).toEqual([
      { concept: "Papel", amountEur: 500, expenseType: "materiales" },
      { concept: "Imprenta", amountEur: 0, expenseType: "materiales" }, // a 0 line stays while the user is typing
    ]);
    expect(patched.version).toBe(2);
    const read = await (await getApp(req(`/api/applications/${application.id}`), ctx({ id: application.id }))).json();
    expect(read.application.version).toBe(2);
  });

  it("ticking a document or saving unchanged text does not invalidate the jury score", async () => {
    await seedOnboardedCreator();
    await grantPro();
    const { application } = await (await postApp(req("/api/applications", { body: { callId: CALL, profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID } }))).json();
    const patch = (b: unknown) => patchApp(req(`/api/applications/${application.id}`, { method: "PATCH", body: b }), ctx({ id: application.id }));
    const checklist = application.checklist.map((c: { done: boolean }, i: number) => (i === 0 ? { ...c, done: true } : c));
    const ticked = (await (await patch({ checklist })).json()).application;
    expect(ticked.checklist[0].done).toBe(true);
    expect(ticked.version).toBe(1);
    expect((await (await patch({ sections: application.sections, budget: application.budget })).json()).application.version).toBe(1);
  });
});
