/**
 * /api/demo/reset with scenarios: always on the signed-in account only, with correct owners, fresh RevenueCat app
 * user ids (paywall back in blank), and the Pro scenario only through the explicit, server-guarded demo path.
 */
import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { POST as resetRoute } from "@/app/api/demo/reset/route";
import { GET as settingsGet, POST as settingsPost } from "@/app/api/demo/settings/route";
import { GET as entitlementRoute } from "@/app/api/entitlements/route";
import { GET as imageRoute } from "@/app/api/works/[id]/image/route";
import { GET as pdfRoute } from "@/app/api/dossier/pdf/route";
import { GET as juryGet } from "@/app/api/jury/route";
import { POST as improveRoute } from "@/app/api/jury/improve/route";
import { POST as modeRoute } from "@/app/api/profile/mode/route";
import { GET as callsRoute } from "@/app/api/calls/route";
import { POST as syncRoute } from "@/app/api/entitlements/route";
import { getDemoSettings } from "@/features/demo/settings";
import { readDb, uploadsDir } from "@/server/store";
import { ctx, createUser, req } from "../helpers";

const ENV_KEYS = ["DEMO_EMAILS", "NEXT_PUBLIC_PURCHASES_MOCK", "NEXT_PUBLIC_REVENUECAT_API_KEY", "REVENUECAT_SECRET_API_KEY"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) if (saved[k] === undefined) delete process.env[k];
  else process.env[k] = saved[k];
});

/** Production-like purchases: real RevenueCat keys, so only DEMO_EMAILS may load the Pro scenario. */
function realPurchases() {
  process.env.NEXT_PUBLIC_PURCHASES_MOCK = "";
  process.env.NEXT_PUBLIC_REVENUECAT_API_KEY = "rcb_sb_test";
  process.env.REVENUECAT_SECRET_API_KEY = "sk_test";
}

const load = async (cookie: string, body: unknown) => resetRoute(req("/api/demo/reset", { cookie, body }));

describe("demo scenarios", () => {
  it("«Artista de ejemplo»: full creator, transcript, dossier, 3 works with photos the owner can read, PDF, paywall still there", async () => {
    const a = await createUser("ana@example.com");
    const res = await load(a.cookie, { scenario: "onboarded" });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, scenario: "onboarded", pro: false });
    expect(out.appUserId).not.toBe(a.user.appUserId);

    const db = readDb();
    const mine = db.profiles.filter((p) => p.ownerId === a.user.id);
    expect(mine.map((p) => p.kind).sort()).toEqual(["business", "creator"]);
    const creator = mine.find((p) => p.kind === "creator")!;
    expect(creator).toMatchObject({ id: out.activeProfileId, displayName: "Antía Varela", city: "A Coruña", territory: expect.any(String) });
    expect(creator.beneficiaryTypes.length).toBeGreaterThan(0);
    const segs = db.transcripts.find((t) => t.profileId === creator.id)!.segments;
    expect(segs.length).toBeGreaterThanOrEqual(8);
    const dossier = db.dossiers.find((d) => d.profileId === creator.id)!;
    expect(dossier.sections).toHaveLength(6);
    for (const s of dossier.sections) for (const id of s.sourceSegmentIds) expect(segs.map((x) => x.id)).toContain(id);
    const works = db.works.filter((w) => w.profileId === creator.id);
    expect(works).toHaveLength(3);
    expect(dossier.workIds).toEqual(works.map((w) => w.id));
    for (const w of works) {
      expect(w).toMatchObject({ confirmed: true, imageUrl: `/api/works/${w.id}/image` });
      const img = await imageRoute(req(w.imageUrl, { cookie: a.cookie }), ctx({ id: w.id }));
      expect(img.status).toBe(200);
      expect(img.headers.get("content-type")).toBe("image/png");
    }
    const pdf = await pdfRoute(req("/api/dossier/pdf", { cookie: a.cookie }));
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    // not Pro: the paywall still shows for this fresh RevenueCat customer
    expect((await (await entitlementRoute(req("/api/entitlements", { cookie: a.cookie }))).json()).entitlement.pro).toBe(false);
  });

  it("«Pyme de ejemplo»: business active, ≥ 3 employees, full memoria; switching back shows the example artist", async () => {
    const a = await createUser("ana@example.com");
    const out = await (await load(a.cookie, { scenario: "business" })).json();
    const db = readDb();
    const biz = db.profiles.find((p) => p.id === out.activeProfileId)!;
    expect(biz).toMatchObject({ kind: "business", ownerId: a.user.id, displayName: "Obradoiro Mareira, S.L.", region: "Galicia" });
    expect(biz.employees).toBeGreaterThanOrEqual(3);
    expect(db.dossiers.find((d) => d.profileId === biz.id)!.sections.map((s) => s.key)).toEqual(["activity", "team", "projects", "figures", "location", "contact"]);
    const feed = await (await callsRoute(req("/api/calls", { cookie: a.cookie }))).json();
    expect(feed.mode).toBe("business");
    const back = await (await modeRoute(req("/api/profile/mode", { cookie: a.cookie, body: { kind: "creator" } }))).json();
    expect(back.profile.displayName).toBe("Antía Varela");
  });

  it("«Artista Pro con solicitud»: demo Pro on a fresh app user id, an application scored 61 and «Aplicar mejoras» → 84", async () => {
    const a = await createUser("ana@example.com");
    const res = await load(a.cookie, { scenario: "pro" });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ scenario: "pro", pro: true, applicationId: expect.any(String), callId: "fixture-beca-artes-plasticas" });
    expect(out.appUserId).not.toBe(a.user.appUserId);
    const ent = (await (await entitlementRoute(req("/api/entitlements", { cookie: a.cookie }))).json()).entitlement;
    expect(ent).toMatchObject({ appUserId: out.appUserId, pro: true, activeProductId: "demo" });

    const db = readDb();
    const app = db.applications.find((x) => x.id === out.applicationId)!;
    const creator = db.profiles.find((p) => p.id === app.profileId)!;
    expect(creator.ownerId).toBe(a.user.id);
    const segIds = db.transcripts.find((t) => t.profileId === creator.id)!.segments.map((s) => s.id);
    for (const s of app.sections) for (const id of s.sourceSegmentIds) expect(segIds).toContain(id);
    expect(app.checklist.some((c) => /Hacienda/.test(c.item))).toBe(true);
    expect(getDemoSettings(a.user.id).deterministicJury).toBe(true);

    const latest = await (await juryGet(req(`/api/jury?applicationId=${app.id}`, { cookie: a.cookie }))).json();
    expect(latest.score.total).toBe(61);
    const improved = await (await improveRoute(req("/api/jury/improve", { cookie: a.cookie, body: { applicationId: app.id, scoreId: latest.score.id } }))).json();
    expect(improved.score.total).toBe(84);
  });

  it("Pro is refused with real purchases unless the account is in DEMO_EMAILS (never bypasses real verification)", async () => {
    realPurchases();
    const a = await createUser("ana@example.com");
    const refused = await load(a.cookie, { scenario: "pro" });
    expect(refused.status).toBe(403);
    // nothing was wiped by the refused attempt
    expect(readDb().users.find((u) => u.id === a.user.id)!.appUserId).toBe(a.user.appUserId);

    process.env.DEMO_EMAILS = "otra@example.com, ANA@example.com";
    const ok = await load(a.cookie, { scenario: "pro" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).pro).toBe(true);
  });

  it("the demo grant cannot be forged by the client: POST /api/entitlements with activeProductId demo is ignored", async () => {
    const a = await createUser("ana@example.com");
    await syncRoute(req("/api/entitlements", { cookie: a.cookie, body: { purchasedProductId: "demo" } }));
    const ent = (await (await entitlementRoute(req("/api/entitlements", { cookie: a.cookie }))).json()).entitlement;
    expect(ent.pro).toBe(false);
  });

  it("«Empezar de cero» after Pro: new app user id with no entitlement (paywall back); optional example pyme", async () => {
    const a = await createUser("ana@example.com");
    const pro = await (await load(a.cookie, { scenario: "pro" })).json();
    const blank = await (await load(a.cookie, { scenario: "blank", withBusiness: true })).json();
    expect(blank.appUserId).not.toBe(pro.appUserId);
    expect(blank.pro).toBe(false);
    const db = readDb();
    expect(db.entitlements.some((e) => e.appUserId === pro.appUserId)).toBe(false);
    expect((await (await entitlementRoute(req("/api/entitlements", { cookie: a.cookie }))).json()).entitlement.pro).toBe(false);
    const mine = db.profiles.filter((p) => p.ownerId === a.user.id);
    expect(mine.find((p) => p.id === blank.activeProfileId)).toMatchObject({ kind: "creator", displayName: "" });
    expect(mine.find((p) => p.kind === "business")?.displayName).toBe("Obradoiro Mareira, S.L.");
    expect(db.applications.some((x) => x.id === pro.applicationId)).toBe(false);
    // the photos of the previous scenario are gone
    const files = fs.readdirSync(uploadsDir());
    expect(db.works.filter((w) => mine.some((p) => p.id === w.profileId))).toHaveLength(0);
    expect(files.filter((f) => f.startsWith("work-"))).toHaveLength(0);
  });

  it("loading a scenario never touches another account", async () => {
    const a = await createUser("ana@example.com");
    const b = await createUser("bea@example.com");
    await load(b.cookie, { scenario: "onboarded" });
    const before = readDb();
    const ofB = (pid: string) => before.profiles.some((p) => p.id === pid && p.ownerId === b.user.id);
    await load(a.cookie, { scenario: "pro" });
    await load(a.cookie, { scenario: "business" });
    const after = readDb();
    expect(after.profiles.filter((p) => p.ownerId === b.user.id)).toEqual(before.profiles.filter((p) => p.ownerId === b.user.id));
    expect(after.works.filter((w) => ofB(w.profileId))).toEqual(before.works.filter((w) => ofB(w.profileId)));
    expect(after.users.find((u) => u.id === b.user.id)).toEqual(before.users.find((u) => u.id === b.user.id));
    expect(getDemoSettings(b.user.id).deterministicJury).toBe(false);
    for (const w of after.works.filter((x) => ofB(x.profileId))) {
      expect((await imageRoute(req(w.imageUrl, { cookie: b.cookie }), ctx({ id: w.id }))).status).toBe(200);
      expect((await imageRoute(req(w.imageUrl, { cookie: a.cookie }), ctx({ id: w.id }))).status).toBe(404);
    }
  });

  it("needs a session", async () => {
    expect((await resetRoute(req("/api/demo/reset", { cookie: null, body: { scenario: "onboarded" } }))).status).toBe(401);
    expect((await settingsGet(req("/api/demo/settings", { cookie: null }))).status).toBe(401);
  });
});

describe("/api/demo/settings", () => {
  it("reports status and scenario checks, and switches only the caller's account", async () => {
    const a = await createUser("ana@example.com");
    const b = await createUser("bea@example.com");
    const st = await (await settingsGet(req("/api/demo/settings", { cookie: a.cookie }))).json();
    expect(st).toMatchObject({ email: "ana@example.com", settings: { deterministicJury: false, aiMock: false }, aiMode: "mock", purchasesMode: "mock", canLoadPro: true });
    expect(st.scenarios.map((s: { scenario: string }) => s.scenario).sort()).toEqual(["blank", "business", "onboarded", "pro"]);
    expect(st.scenarios.every((s: { ok: boolean }) => s.ok)).toBe(true);
    expect(st.openCalls.creator).toBeGreaterThan(0);

    const on = await (await settingsPost(req("/api/demo/settings", { cookie: a.cookie, body: { deterministicJury: true } }))).json();
    expect(on.settings).toEqual({ deterministicJury: true, aiMock: false });
    const both = await (await settingsPost(req("/api/demo/settings", { cookie: a.cookie, body: { aiMock: true } }))).json();
    expect(both.settings).toEqual({ deterministicJury: true, aiMock: true }); // an omitted switch keeps its value
    expect(getDemoSettings(b.user.id)).toEqual({ deterministicJury: false, aiMock: false });
  });

  it("keeps the switches across «Empezar de cero»", async () => {
    const a = await createUser("ana@example.com");
    await settingsPost(req("/api/demo/settings", { cookie: a.cookie, body: { aiMock: true } }));
    await load(a.cookie, { scenario: "blank" });
    expect(getDemoSettings(a.user.id).aiMock).toBe(true);
  });
});
