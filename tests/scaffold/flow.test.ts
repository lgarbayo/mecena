/** End-to-end baseline of the demo path through the shared tools module, all on mocks. */
import { describe, expect, it } from "vitest";
import { PaymentRequiredError, TOOL_NAMES } from "@/contracts";
import { DEMO_APP_USER_ID } from "@/fixtures";
import { runTool, isToolName } from "@/tools/registry";
import { processTurn } from "@/features/onboarding/service";
import { syncEntitlement } from "@/features/purchases/server";
import { improveApplication } from "@/features/jury/service";
import { grantPro, seedOnboardedCreator } from "../helpers";

const app = { caller: "app" as const, appUserId: DEMO_APP_USER_ID };

describe("demo path baseline (scaffold)", () => {
  it("onboarding turn stores the segment and grows the dossier", async () => {
    const r = await processTurn({ text: "Soy ilustradora de A Coruña", source: "voice" });
    expect(r.sections.length).toBeGreaterThan(0);
    expect(r.segmentId).toMatch(/^seg-/);
  });

  it("every tool name is registered", () => {
    expect(TOOL_NAMES.every(isToolName)).toBe(true);
  });

  it("search_calls / explain_call / build_dossier / export_dossier_pdf work", async () => {
    await seedOnboardedCreator();
    const { results } = await runTool("search_calls", {}, app);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.call.beneficiaryKinds.includes("creator"))).toBe(true);
    const ex = await runTool("explain_call", { callId: results[0].call.id }, app);
    expect(ex.checklist.length).toBeGreaterThan(0);
    const d = await runTool("build_dossier", { callId: "fixture-beca-artes-plasticas" }, app);
    expect(d.dossier.variant?.maxImages).toBe(10);
    const pdf = await runTool("export_dossier_pdf", {}, app);
    expect(pdf.url).toContain("/api/dossier/pdf");
  });

  it("draft_application requires an entitlement (paywall), then works", async () => {
    await seedOnboardedCreator();
    await expect(runTool("draft_application", { callId: "fixture-beca-artes-plasticas" }, app)).rejects.toBeInstanceOf(PaymentRequiredError);
    await syncEntitlement({ appUserId: DEMO_APP_USER_ID, purchasedProductId: "mecena_solicitud_premium" });
    const { application } = await runTool("draft_application", { callId: "fixture-beca-artes-plasticas" }, app);
    expect(application.version).toBe(1);
  });

  it("jury scores, then improves after fixes", async () => {
    await seedOnboardedCreator();
    await grantPro();
    const { application } = await runTool("draft_application", { callId: "fixture-beca-artes-plasticas" }, app);
    const { score } = await runTool("score_application", { applicationId: application.id }, app);
    const better = await improveApplication({ applicationId: application.id, scoreId: score.id });
    expect(better.score.total).toBeGreaterThan(score.total);
  });
});
