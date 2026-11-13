import { describe, expect, it } from "vitest";
import { PaymentRequiredError } from "@/contracts";
import { GET, POST } from "@/app/api/entitlements/route";
import { consumeDraftCredit, requireDraftEntitlement, syncEntitlement } from "@/features/purchases/server";
import { req } from "../helpers";

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
  it("POST grants (mock) and GET reads it back", async () => {
    const posted = await (await POST(req("/api/entitlements", { body: { appUserId: "u3", purchasedProductId: "mecena_pro_annual", via: "mock" } }))).json();
    expect(posted.entitlement).toMatchObject({ pro: true, activeProductId: "mecena_pro_annual", source: "mock" });
    const got = await (await GET(req("/api/entitlements?appUserId=u3"))).json();
    expect(got.entitlement.pro).toBe(true);
  });

  it("POST rejects a request without appUserId", async () => {
    expect((await POST(req("/api/entitlements", { body: { pro: true } }))).status).toBe(400);
  });
});
