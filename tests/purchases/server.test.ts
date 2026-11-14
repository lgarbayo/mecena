import { describe, expect, it, beforeEach } from "vitest";
import { PaymentRequiredError } from "@/contracts";
import { GET, POST } from "@/app/api/entitlements/route";
import { consumeDraftCredit, requireDraftEntitlement, syncEntitlement } from "@/features/purchases/server";
import { DEMO_APP_USER_ID } from "@/fixtures";
import { getEntitlement } from "@/server/store";
import { createUser, req, loginDemo } from "../helpers";

// Route handlers need a session: run as the demo account (owns the fixture profiles).
beforeEach(async () => {
  await loginDemo();
});

describe("draft gate", () => {
  it("no plan → PaymentRequiredError", async () => {
    await expect(requireDraftEntitlement("nobody")).rejects.toBeInstanceOf(PaymentRequiredError);
  });

  it("a premium credit allows exactly one new draft", async () => {
    await syncEntitlement({ appUserId: "u1", purchasedProductId: "mecena_solicitud_premium" });
    await expect(requireDraftEntitlement("u1")).resolves.toMatchObject({ premiumCredits: 1 });
    expect((await consumeDraftCredit("u1")).premiumCredits).toBe(0);
    await expect(requireDraftEntitlement("u1")).rejects.toBeInstanceOf(PaymentRequiredError);
  });

  it("Pro allows unlimited drafts and never spends credits", async () => {
    await syncEntitlement({ appUserId: "u2", purchasedProductId: "mecena_pro_monthly" });
    await syncEntitlement({ appUserId: "u2", purchasedProductId: "mecena_solicitud_premium" });
    for (let i = 0; i < 3; i++) {
      await requireDraftEntitlement("u2");
      expect((await consumeDraftCredit("u2")).premiumCredits).toBe(1);
    }
  });
});

describe("/api/entitlements", () => {
  it("POST grants (mock) to the signed-in user and GET reads it back", async () => {
    const posted = await (await POST(req("/api/entitlements", { body: { purchasedProductId: "mecena_pro_annual", via: "mock" } }))).json();
    expect(posted.entitlement).toMatchObject({ appUserId: DEMO_APP_USER_ID, pro: true, activeProductId: "mecena_pro_annual", source: "mock" });
    const got = await (await GET(req("/api/entitlements"))).json();
    expect(got.entitlement.pro).toBe(true);
  });

  it("ignores a client-supplied appUserId: the purchase lands on the user's own id, and nobody reads someone else's", async () => {
    const posted = await (await POST(req("/api/entitlements", { body: { appUserId: "u3", purchasedProductId: "mecena_pro_annual" } }))).json();
    expect(posted.entitlement.appUserId).toBe(DEMO_APP_USER_ID);
    expect(getEntitlement("u3").pro).toBe(false);
    await syncEntitlement({ appUserId: "u4", purchasedProductId: "mecena_pro_monthly" });
    const { cookie } = await createUser("sin-pro@mecena.test");
    const got = await (await GET(req("/api/entitlements?appUserId=u4", { cookie }))).json();
    expect(got.entitlement.pro).toBe(false);
  });

  it("401 without a session", async () => {
    expect((await GET(req("/api/entitlements", { cookie: null }))).status).toBe(401);
    expect((await POST(req("/api/entitlements", { body: { pro: true }, cookie: null }))).status).toBe(401);
  });
});
