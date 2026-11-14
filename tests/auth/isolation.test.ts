/**
 * Two accounts, A and B, on the same server: neither can read or change the other's data through any route, the
 * tools or a demo reset. Unknown and foreign ids look the same (404), so existence does not leak.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET as getProfileRoute, PATCH as patchProfileRoute } from "@/app/api/profile/route";
import { POST as modeRoute } from "@/app/api/profile/mode/route";
import { GET as listWorksRoute, POST as createWorkRoute } from "@/app/api/works/route";
import { DELETE as deleteWorkRoute, GET as getWorkRoute, PATCH as patchWorkRoute } from "@/app/api/works/[id]/route";
import { GET as imageRoute } from "@/app/api/works/[id]/image/route";
import { POST as describeRoute } from "@/app/api/works/[id]/describe/route";
import { POST as moveRoute } from "@/app/api/works/[id]/move/route";
import { GET as getAppsRoute, POST as postAppRoute } from "@/app/api/applications/route";
import { GET as getAppRoute, PATCH as patchAppRoute } from "@/app/api/applications/[id]/route";
import { GET as getJuryRoute, POST as postJuryRoute } from "@/app/api/jury/route";
import { POST as improveRoute } from "@/app/api/jury/improve/route";
import { GET as dossierRoute } from "@/app/api/dossier/route";
import { GET as pdfRoute } from "@/app/api/dossier/pdf/route";
import { DELETE as designDeleteRoute, GET as designRoute, POST as designPostRoute } from "@/app/api/dossier/design/route";
import { GET as callsRoute } from "@/app/api/calls/route";
import { GET as callRoute } from "@/app/api/calls/[id]/route";
import { GET as onboardingRoute } from "@/app/api/onboarding/route";
import { POST as turnRoute } from "@/app/api/onboarding/turn/route";
import { POST as importRoute } from "@/app/api/onboarding/import/route";
import { GET as entitlementRoute, POST as syncRoute } from "@/app/api/entitlements/route";
import { POST as agentRoute } from "@/app/api/agent/route";
import { POST as resetRoute } from "@/app/api/demo/reset/route";
import { NotFoundError, type Work } from "@/contracts";
import { syncEntitlement } from "@/features/purchases/server";
import { runTool } from "@/tools/registry";
import { toolContextFor } from "@/server/auth";
import { exportsDir, getEntitlement, getProfile, getTranscript, listJuryScores, readDb, uploadsDir } from "@/server/store";
import { ctx, createUser, req } from "../helpers";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const CALL = "fixture-beca-artes-plasticas";

async function twoUsers() {
  const a = await createUser("ana@example.com");
  const b = await createUser("bea@example.com");
  return { a, b };
}

/** B with real data: an onboarding turn, a work (photo on disk), Pro, a drafted application with a jury score. */
async function giveData(u: { cookie: string; user: { appUserId: string } }) {
  const as = (url: string, body?: unknown) => req(url, { cookie: u.cookie, ...(body ? { body } : {}) });
  expect((await turnRoute(as("/api/onboarding/turn", { text: "Me llamo Bea Souto, soy ilustradora de A Coruña.", source: "text" }))).status).toBe(200);
  const work: Work = (await (await createWorkRoute(as("/api/works", { imageDataUrl: PNG, voiceDescription: "Se llama Faro" }))).json()).work;
  await syncEntitlement({ appUserId: u.user.appUserId, purchasedProductId: "mecena_pro_monthly" });
  const created = await postAppRoute(as("/api/applications", { callId: CALL }));
  expect(created.status).toBe(201);
  const application = (await created.json()).application;
  const score = (await (await postJuryRoute(as("/api/jury", { applicationId: application.id }))).json()).score;
  return { work, application, score };
}

describe("two accounts cannot see each other", () => {
  it("each sees only their own profile; A cannot read or patch B's profile by passing its id", async () => {
    const { a, b } = await twoUsers();
    const meA = await (await getProfileRoute(req("/api/profile", { cookie: a.cookie }))).json();
    const meB = await (await getProfileRoute(req("/api/profile", { cookie: b.cookie }))).json();
    expect(meA.profile.id).not.toBe(meB.profile.id);
    expect(meA.appUserId).toBe(a.user.appUserId);

    const read = await getProfileRoute(req(`/api/profile?profileId=${meB.profile.id}`, { cookie: a.cookie }));
    expect(read.status).toBe(404);
    const patch = await patchProfileRoute(req("/api/profile", { method: "PATCH", cookie: a.cookie, body: { profileId: meB.profile.id, patch: { displayName: "Hackeado" } } }));
    expect(patch.status).toBe(404);
    expect(getProfile(meB.profile.id).displayName).toBe("");
    // the fixture/legacy profiles (no owner) are nobody's
    expect((await getProfileRoute(req("/api/profile?profileId=demo-creator", { cookie: a.cookie }))).status).toBe(404);
    // ownership cannot be patched in
    await patchProfileRoute(req("/api/profile", { method: "PATCH", cookie: a.cookie, body: { patch: { ownerId: b.user.id, displayName: "Ana" } } }));
    expect(getProfile(meA.profile.id)).toMatchObject({ ownerId: a.user.id, displayName: "Ana" });
  });

  it("A cannot read, change, move, describe, delete or list B's works, nor fetch B's photo", async () => {
    const { a, b } = await twoUsers();
    const { work } = await giveData(b);
    const asA = (url: string, init: { method?: string; body?: unknown } = {}) => req(url, { ...init, cookie: a.cookie });
    const id = ctx({ id: work.id });
    expect((await getWorkRoute(asA(`/api/works/${work.id}`), id)).status).toBe(404);
    expect((await imageRoute(asA(work.imageUrl), id)).status).toBe(404);
    expect((await patchWorkRoute(asA(`/api/works/${work.id}`, { method: "PATCH", body: { sheet: { title: "Mío" } } }), id)).status).toBe(404);
    expect((await describeRoute(asA(`/api/works/${work.id}/describe`, { body: { voiceDescription: "Se llama Mío" } }), id)).status).toBe(404);
    expect((await moveRoute(asA(`/api/works/${work.id}/move`, { body: { direction: 1 } }), id)).status).toBe(404);
    expect((await deleteWorkRoute(asA(`/api/works/${work.id}`, { method: "DELETE" }), id)).status).toBe(404);
    expect((await listWorksRoute(asA(`/api/works?profileId=${work.profileId}`))).status).toBe(404);
    expect((await (await listWorksRoute(asA("/api/works"))).json()).works).toEqual([]);
    // B still has it, untouched, and gets the photo
    const mine = await imageRoute(req(work.imageUrl, { cookie: b.cookie }), id);
    expect(mine.status).toBe(200);
    expect(mine.headers.get("cache-control")).toContain("private");
    expect(readDb().works.find((w) => w.id === work.id)?.sheet.title).toBe(work.sheet.title);
  });

  it("A cannot reach B's application, jury scores, dossier, PDF, design, matches or onboarding", async () => {
    const { a, b } = await twoUsers();
    const { application, score, work } = await giveData(b);
    const pid = work.profileId;
    const asA = (url: string, init: { method?: string; body?: unknown } = {}) => req(url, { ...init, cookie: a.cookie });
    const app = ctx({ id: application.id });

    expect((await getAppRoute(asA(`/api/applications/${application.id}`), app)).status).toBe(404);
    expect((await patchAppRoute(asA(`/api/applications/${application.id}`, { method: "PATCH", body: { sections: [] } }), app)).status).toBe(404);
    expect((await getAppsRoute(asA(`/api/applications?callId=${CALL}&profileId=${pid}`))).status).toBe(404);
    expect((await (await getAppsRoute(asA(`/api/applications?callId=${CALL}`))).json()).application).toBeNull();
    expect((await postAppRoute(asA("/api/applications", { body: { callId: CALL, profileId: pid } }))).status).toBe(404);
    expect((await getJuryRoute(asA(`/api/jury?applicationId=${application.id}`))).status).toBe(404);
    expect((await postJuryRoute(asA("/api/jury", { body: { applicationId: application.id } }))).status).toBe(404);
    expect((await improveRoute(asA("/api/jury/improve", { body: { applicationId: application.id, scoreId: score.id } }))).status).toBe(404);
    expect(listJuryScores(application.id)).toHaveLength(1);

    expect((await dossierRoute(asA(`/api/dossier?profileId=${pid}`))).status).toBe(404);
    expect((await pdfRoute(asA(`/api/dossier/pdf?profileId=${pid}`))).status).toBe(404);
    expect((await pdfRoute(req(`/api/dossier/pdf?profileId=${pid}`, { cookie: null }))).status).toBe(401); // a shared link without B's session
    expect((await designRoute(asA(`/api/dossier/design?profileId=${pid}`))).status).toBe(404);
    expect((await designPostRoute(asA("/api/dossier/design", { body: { preset: "editorial", profileId: pid } }))).status).toBe(404);
    expect((await designDeleteRoute(asA(`/api/dossier/design?profileId=${pid}`, { method: "DELETE" }))).status).toBe(404);
    expect((await callsRoute(asA(`/api/calls?profileId=${pid}`))).status).toBe(404);
    expect((await callRoute(asA(`/api/calls/${CALL}?profileId=${pid}`), ctx({ id: CALL }))).status).toBe(404);
    expect((await onboardingRoute(asA(`/api/onboarding?profileId=${pid}`))).status).toBe(404);
    expect((await turnRoute(asA("/api/onboarding/turn", { body: { profileId: pid, text: "Soy Ana", source: "text" } }))).status).toBe(404);
    expect((await importRoute(asA("/api/onboarding/import", { body: { profileId: pid, text: "Bio de Ana" } }))).status).toBe(404);
    expect(getTranscript(pid)).toHaveLength(1);

    // B's own PDF works
    const pdf = await pdfRoute(req(`/api/dossier/pdf?profileId=${pid}`, { cookie: b.cookie }));
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
  });

  it("entitlements are per account: B's Pro never unlocks A, whatever appUserId A sends", async () => {
    const { a, b } = await twoUsers();
    await syncEntitlement({ appUserId: b.user.appUserId, purchasedProductId: "mecena_pro_monthly" });
    const got = await (await entitlementRoute(req(`/api/entitlements?appUserId=${b.user.appUserId}`, { cookie: a.cookie }))).json();
    expect(got.entitlement).toMatchObject({ appUserId: a.user.appUserId, pro: false });
    // a purchase sync claiming B's id lands on A's own id
    await syncRoute(req("/api/entitlements", { cookie: a.cookie, body: { appUserId: b.user.appUserId, purchasedProductId: "mecena_solicitud_premium" } }));
    expect(getEntitlement(b.user.appUserId).premiumCredits).toBe(0);
    expect(getEntitlement(a.user.appUserId).premiumCredits).toBe(1);
    // drafting with B's appUserId in the body still needs A's own entitlement
    const fresh = await createUser("cris@example.com");
    const denied = await postAppRoute(req("/api/applications", { cookie: fresh.cookie, body: { callId: CALL, appUserId: b.user.appUserId } }));
    expect(denied.status).toBe(402);
    // the free plan's lock follows the account too
    const feedA = await (await callsRoute(req(`/api/calls?appUserId=${b.user.appUserId}`, { cookie: fresh.cookie }))).json();
    expect(feedA.pro).toBe(false);
  });

  it("the agent's tools only touch the caller's data", async () => {
    const { a, b } = await twoUsers();
    const { application, work } = await giveData(b);
    const ctxA = await toolContextFor(a.user, "app");
    await expect(runTool("get_profile", { profileId: work.profileId }, ctxA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(runTool("update_profile", { profileId: work.profileId, patch: { city: "Lugo" } }, ctxA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(runTool("build_dossier", { profileId: work.profileId }, ctxA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(runTool("export_dossier_pdf", { profileId: work.profileId }, ctxA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(runTool("search_calls", { profileId: work.profileId }, ctxA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(runTool("draft_application", { callId: CALL, profileId: work.profileId }, ctxA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(runTool("score_application", { applicationId: application.id }, ctxA)).rejects.toBeInstanceOf(NotFoundError);
    expect(getProfile(work.profileId).city).not.toBe("Lugo");
    // without a profileId: A's own active profile
    expect((await runTool("get_profile", {}, ctxA)).profile.id).toBe(a.user.activeProfileId);
    // and through the route (mock agent): A's "tribunal" request cannot find B's application
    const turn = await (await agentRoute(req("/api/agent", { cookie: a.cookie, body: { message: "Que la puntúe el tribunal", appUserId: b.user.appUserId } }))).json();
    expect(turn.reply).toMatch(/Todavía no tienes ninguna solicitud/);
  });
});

describe("mode switch is per account", () => {
  it("creates the user's own business profile the first time, and switches back to their creator profile", async () => {
    const { a, b } = await twoUsers();
    const creatorA = a.user.activeProfileId;
    const biz = await (await modeRoute(req("/api/profile/mode", { cookie: a.cookie, body: { kind: "business" } }))).json();
    expect(biz.profile).toMatchObject({ kind: "business", ownerId: a.user.id, displayName: "" });
    expect(biz.profile.id).not.toBe("demo-business");
    expect(biz.appUserId).toBe(a.user.appUserId);
    expect((await (await getProfileRoute(req("/api/profile", { cookie: a.cookie }))).json()).profile.id).toBe(biz.profile.id);
    // again: same business profile, not a new one
    const again = await (await modeRoute(req("/api/profile/mode", { cookie: a.cookie, body: { kind: "business" } }))).json();
    expect(again.profile.id).toBe(biz.profile.id);
    const back = await (await modeRoute(req("/api/profile/mode", { cookie: a.cookie, body: { kind: "creator" } }))).json();
    expect(back.profile.id).toBe(creatorA);
    // B is untouched: still creator, no business profile of their own
    expect((await (await getProfileRoute(req("/api/profile", { cookie: b.cookie }))).json()).profile.kind).toBe("creator");
    expect(readDb().profiles.filter((p) => p.ownerId === b.user.id)).toHaveLength(1);
    expect(readDb().profiles.filter((p) => p.ownerId === a.user.id).map((p) => p.kind).sort()).toEqual(["business", "creator"]);
  });
});

describe("demo reset is per account", () => {
  it("wipes A's data (files included) and rotates A's app user id; B keeps everything", async () => {
    const { a, b } = await twoUsers();
    const dataA = await giveData(a);
    const dataB = await giveData(b);
    // a PDF export for each (MCP / agent tool)
    await runTool("export_dossier_pdf", {}, await toolContextFor(a.user, "app"));
    await runTool("export_dossier_pdf", {}, await toolContextFor(b.user, "app"));
    const before = readDb();
    const imageFile = (w: Work) => fs.readdirSync(uploadsDir()).find((f) => f.startsWith(`${w.id}.`));
    expect(imageFile(dataA.work)).toBeTruthy();

    const res = await resetRoute(req("/api/demo/reset", { cookie: a.cookie, body: {} }));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.appUserId).not.toBe(a.user.appUserId);

    const db = readDb();
    const userA = db.users.find((u) => u.id === a.user.id)!;
    expect(userA.appUserId).toBe(out.appUserId);
    const mineA = db.profiles.filter((p) => p.ownerId === a.user.id);
    expect(mineA).toHaveLength(1);
    expect(mineA[0]).toMatchObject({ id: out.activeProfileId, kind: "creator", displayName: "" });
    expect(db.works.some((w) => w.id === dataA.work.id)).toBe(false);
    expect(db.applications.some((x) => x.id === dataA.application.id)).toBe(false);
    expect(db.juryScores.some((s) => s.applicationId === dataA.application.id)).toBe(false);
    expect(db.transcripts.some((t) => t.profileId === dataA.work.profileId)).toBe(false);
    expect(db.dossiers.some((d) => d.profileId === dataA.work.profileId)).toBe(false);
    expect(db.entitlements.some((e) => e.appUserId === a.user.appUserId)).toBe(false);
    expect(imageFile(dataA.work)).toBeUndefined();
    expect(fs.readdirSync(exportsDir()).some((f) => f.includes(dataA.work.profileId))).toBe(false);
    // the paywall is back for A
    expect((await (await entitlementRoute(req("/api/entitlements", { cookie: a.cookie }))).json()).entitlement.pro).toBe(false);

    // B: everything as it was
    const keep = <T>(xs: T[], pick: (x: T) => boolean) => xs.filter(pick);
    const ofB = (pid: string) => pid === dataB.work.profileId;
    expect(keep(db.profiles, (p) => p.ownerId === b.user.id)).toEqual(keep(before.profiles, (p) => p.ownerId === b.user.id));
    expect(keep(db.works, (w) => ofB(w.profileId))).toEqual(keep(before.works, (w) => ofB(w.profileId)));
    expect(keep(db.applications, (x) => ofB(x.profileId))).toEqual(keep(before.applications, (x) => ofB(x.profileId)));
    expect(keep(db.transcripts, (t) => ofB(t.profileId))).toEqual(keep(before.transcripts, (t) => ofB(t.profileId)));
    expect(db.users.find((u) => u.id === b.user.id)).toEqual(before.users.find((u) => u.id === b.user.id));
    expect(listJuryScores(dataB.application.id)).toHaveLength(1);
    expect(getEntitlement(b.user.appUserId).pro).toBe(true);
    expect(imageFile(dataB.work)).toBeTruthy();
    expect(fs.readdirSync(exportsDir()).some((f) => f.includes(dataB.work.profileId))).toBe(true);
    expect((await imageRoute(req(dataB.work.imageUrl, { cookie: b.cookie }), ctx({ id: dataB.work.id }))).status).toBe(200);
    expect(path.isAbsolute(uploadsDir())).toBe(true);
  });
});

describe("no session, no data", () => {
  it("every API route answers 401 without a valid session", async () => {
    const id = ctx({ id: "x" });
    const anon = (url: string, init: { method?: string; body?: unknown } = {}) => req(url, { ...init, cookie: null });
    const forged = (url: string, init: { method?: string; body?: unknown } = {}) => req(url, { ...init, cookie: "mecena_session=forged" });
    for (const make of [anon, forged]) {
      const calls: [string, Promise<Response>][] = [
        ["GET profile", getProfileRoute(make("/api/profile"))],
        ["PATCH profile", patchProfileRoute(make("/api/profile", { method: "PATCH", body: { patch: {} } }))],
        ["POST mode", modeRoute(make("/api/profile/mode", { body: { kind: "business" } }))],
        ["GET works", listWorksRoute(make("/api/works"))],
        ["POST works", createWorkRoute(make("/api/works", { body: { imageDataUrl: PNG } }))],
        ["GET work", getWorkRoute(make("/api/works/x"), id)],
        ["GET image", imageRoute(make("/api/works/x/image"), id)],
        ["GET applications", getAppsRoute(make(`/api/applications?callId=${CALL}`))],
        ["POST applications", postAppRoute(make("/api/applications", { body: { callId: CALL } }))],
        ["GET application", getAppRoute(make("/api/applications/x"), id)],
        ["GET jury", getJuryRoute(make("/api/jury?applicationId=x"))],
        ["GET dossier", dossierRoute(make("/api/dossier"))],
        ["GET pdf", pdfRoute(make("/api/dossier/pdf"))],
        ["GET design", designRoute(make("/api/dossier/design"))],
        ["GET calls", callsRoute(make("/api/calls"))],
        ["GET call", callRoute(make(`/api/calls/${CALL}`), ctx({ id: CALL }))],
        ["GET onboarding", onboardingRoute(make("/api/onboarding"))],
        ["POST turn", turnRoute(make("/api/onboarding/turn", { body: { text: "Hola", source: "text" } }))],
        ["GET entitlements", entitlementRoute(make("/api/entitlements"))],
        ["POST agent", agentRoute(make("/api/agent", { body: { message: "hola" } }))],
        ["POST reset", resetRoute(make("/api/demo/reset", { body: {} }))],
      ];
      for (const [name, p] of calls) {
        const res = await p;
        expect(res.status, name).toBe(401);
        expect((await res.json()).error, name).toBe("unauthorized");
      }
    }
    expect(readDb().profiles.every((p) => !p.ownerId)).toBe(true); // nothing was created for anyone
  });
});
