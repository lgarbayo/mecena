import { beforeEach, describe, expect, it } from "vitest";
import { JURY_RUNS_PER_APPLICATION, type Call } from "@/contracts";
import { POST as postApp } from "@/app/api/applications/route";
import { POST as postJury } from "@/app/api/jury/route";
import { POST as postImprove } from "@/app/api/jury/improve/route";
import { closesIn, closingSoon } from "@/features/purchases/alerts";
import { OFFER, PLANS, plansFor, TRIGGER_SUBTITLE, unlocks } from "@/features/purchases/offer";
import { syncEntitlement } from "@/features/purchases/server";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID, fixtureCalls } from "@/fixtures";
import { getEntitlement } from "@/server/store";
import { loginDemo, req, seedOnboardedCreator } from "../helpers";

describe("the Hormozi offer (Spanish from Spain)", () => {
  it("keeps prices, anchor, guarantee and the free plan", () => {
    expect(PLANS.map((p) => [p.id, p.priceText])).toEqual([
      ["proAnnual", "35,88 €/año"],
      ["proMonthly", "3,99 €/mes"],
      ["solicitudPremium", "15,00 €"],
    ]);
    expect(OFFER.anchor()).toBe("Una consultora se lleva un 10-15 % de tu beca. Con Mecena, 3,99 € al mes.");
    expect(OFFER.guarantee).toBe("Garantía: si en 90 días no has presentado 3 solicitudes, te devolvemos el dinero.");
    expect(OFFER.free).toBe("Gratis siempre: tu perfil, tu dossier y 3 convocatorias al mes.");
    expect(TRIGGER_SUBTITLE.draft_application).toContain("Tu solicitud está a un paso");
    expect(PLANS.find((p) => p.id === "solicitudPremium")!.bullets.join(" ")).toContain(`${JURY_RUNS_PER_APPLICATION} pasadas por el tribunal`);
  });

  it("no voseo, no promises without a feature behind them", () => {
    const all = JSON.stringify({ OFFER: { ...OFFER, anchor: OFFER.anchor(), credits: OFFER.credits(2) }, TRIGGER_SUBTITLE, PLANS });
    expect(all).not.toMatch(/\b(tenés|podés|querés|sos|vos)\b/);
    expect(all).not.toMatch(/criterios oficiales|avisos antes de que cierren/);
  });

  it("the one-off plan is offered only where it unlocks a draft", () => {
    expect(plansFor("draft_application", PLANS).map((p) => p.id)).toContain("solicitudPremium");
    expect(plansFor("pricing_page", PLANS).map((p) => p.id)).toContain("solicitudPremium");
    for (const t of ["match_limit", "dossier_variant", "jury"] as const) expect(plansFor(t, PLANS).map((p) => p.id)).toEqual(["proAnnual", "proMonthly"]);
  });

  it("a premium credit unlocks a draft, not more matches", () => {
    const credit = { pro: false, premiumCredits: 1 };
    expect(unlocks("draft_application", credit)).toBe(true);
    expect(unlocks("match_limit", credit)).toBe(false);
    expect(unlocks("match_limit", { pro: true, premiumCredits: 0 })).toBe(true);
  });
});

describe("Pro deadline alert", () => {
  const base = fixtureCalls[0];
  const at = (id: string, deadline: string | null, extra: Partial<Call> = {}) => ({ call: { ...base, id, title: id, deadline, status: "open" as const, deadlineText: "", ...extra } });
  const now = new Date("2026-11-14T10:00:00Z");

  it("lists open calls with a published deadline within 7 days, soonest first", () => {
    const soon = closingSoon(
      [
        at("in-5", "2026-11-19"),
        at("today", "2026-11-14"),
        at("in-8", "2026-11-22"),
        at("closed", "2026-11-13"),
        at("rolling", null),
        at("estimated", "2026-11-16", { deadlineText: "Estimado: mediados de noviembre" }),
        at("recurring", "2026-11-15", { status: "recurring" }),
      ],
      now,
    );
    expect(soon.map((s) => [s.call.id, s.days])).toEqual([
      ["today", 0],
      ["in-5", 5],
    ]);
  });

  it("says when it closes", () => {
    expect([0, 1, 4].map(closesIn)).toEqual(["Cierra hoy", "Cierra mañana", "Cierra en 4 días"]);
  });
});

describe("jury routes: Pro, or the runs included with a premium application", () => {
  beforeEach(async () => {
    await loginDemo();
  });

  it(`after ${JURY_RUNS_PER_APPLICATION} runs without Pro the jury answers 402; Pro unlocks it again`, async () => {
    await seedOnboardedCreator();
    await syncEntitlement({ appUserId: DEMO_APP_USER_ID, purchasedProductId: "mecena_solicitud_premium" });
    const { application } = await (await postApp(req("/api/applications", { body: { callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID } }))).json();
    const body = { applicationId: application.id };
    const first = await (await postJury(req("/api/jury", { body }))).json();
    expect((await postImprove(req("/api/jury/improve", { body: { ...body, scoreId: first.score.id } }))).status).toBe(200);
    // a repeated POST on the same version reuses the saved score for free: only `force` asks for a new pass
    const again = await postJury(req("/api/jury", { body }));
    expect(again.status).toBe(200);
    expect(getEntitlement(DEMO_APP_USER_ID).juryRuns?.[application.id]).toBe(2);
    const forced = { applicationId: application.id, force: true };
    for (let i = 2; i < JURY_RUNS_PER_APPLICATION; i++) expect((await postJury(req("/api/jury", { body: forced }))).status).toBe(200);
    const blocked = await postJury(req("/api/jury", { body: forced }));
    expect(blocked.status).toBe(402);
    expect((await blocked.json()).message).toContain("Mecena Pro");
    expect(getEntitlement(DEMO_APP_USER_ID).juryRuns?.[application.id]).toBe(JURY_RUNS_PER_APPLICATION);
    await syncEntitlement({ appUserId: DEMO_APP_USER_ID, purchasedProductId: "mecena_pro_monthly" });
    expect((await postJury(req("/api/jury", { body: forced }))).status).toBe(200);
  });
});
