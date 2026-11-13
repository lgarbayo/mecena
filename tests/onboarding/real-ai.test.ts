/** The real Claude path, with `structured()` mocked (no network, no key). */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/llm", async (orig) => {
  const mod = await orig<typeof import("@/server/ai/llm")>();
  return { ...mod, structured: vi.fn() };
});

import { AiError, structured } from "@/server/ai/llm";
import { realOnboardingTurn, warmOnboardingAi } from "@/features/onboarding/ai";
import { systemPrompt, userPayload, CONTEXT_SEGMENTS } from "@/features/onboarding/prompt";
import { blankCreator, FIXTURE_NOW } from "@/fixtures";
import type { OnboardingTurnInput, TranscriptSegment } from "@/contracts";

const mocked = vi.mocked(structured);
afterEach(() => mocked.mockReset());

const segs: TranscriptSegment[] = Array.from({ length: 14 }, (_, i) => ({ id: `seg-${i}`, text: `fragmento ${i}`, source: "voice", at: FIXTURE_NOW }));
const input = (text = "Me llamo Antía Varela, soy ilustradora de A Coruña."): OnboardingTurnInput => {
  const newSegment = { id: "seg-new", text, source: "voice" as const, at: FIXTURE_NOW };
  return {
    kind: "creator",
    profile: blankCreator,
    sections: [{ key: "bio", title: "Biografía", body: "Antes.", sourceSegmentIds: ["seg-1"], status: "draft", updatedAt: FIXTURE_NOW }],
    transcript: [...segs, newSegment],
    newSegment,
  };
};

describe("onboarding real AI path", () => {
  it("calls structured() on the fast tier with the SPEC prompt and a compact payload", async () => {
    mocked.mockResolvedValue({
      profilePatch: { displayName: "Antía Varela", city: "A Coruña", disciplines: ["ilustración"], achievements: [] },
      sectionUpdates: [
        { key: "bio", body: "Antes.\n\nSoy ilustradora de A Coruña.", sourceSegmentIds: ["seg-new", "invented-id"] },
        { key: "cv", body: "", sourceSegmentIds: [] },
      ],
      followUpQuestion: "¿Qué proyecto te gustaría financiar?",
    });
    const r = await realOnboardingTurn(input());
    const call = mocked.mock.calls[0][0];
    expect(call.tier).toBe("fast");
    expect(call.effort).toBe("low");
    expect(call.system).toMatch(/NUNCA inventes/);
    expect(call.system).toMatch(/statement \(Declaración artística\)/);
    const payload = JSON.parse(call.user as string);
    expect(payload.nuevoFragmento).toEqual({ id: "seg-new", texto: "Me llamo Antía Varela, soy ilustradora de A Coruña." });
    expect(payload.fragmentosAnteriores).toHaveLength(CONTEXT_SEGMENTS);
    expect(payload.seccionesActuales[0].key).toBe("bio");
    expect(payload.perfilActual.id).toBeUndefined();

    expect(r.profilePatch).toEqual({ displayName: "Antía Varela", city: "A Coruña", disciplines: ["ilustración"] });
    expect(r.sectionUpdates).toHaveLength(1);
    expect(r.sectionUpdates[0]).toMatchObject({ key: "bio", title: "Biografía", status: "draft" });
    expect(r.sectionUpdates[0].sourceSegmentIds).toEqual(["seg-1", "seg-new"]); // unknown ids dropped, provenance kept
    expect(r.followUpQuestion).toMatch(/proyecto/);
  });

  it("falls back to the deterministic mock on AiError", async () => {
    mocked.mockRejectedValue(new AiError("rate limited", "api"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await realOnboardingTurn(input());
    expect(r.profilePatch.displayName).toBe("Antía Varela");
    expect(r.sectionUpdates.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
  });

  it("the business prompt uses business section keys", () => {
    expect(systemPrompt("business")).toMatch(/figures \(Cifras\)/);
    expect(systemPrompt("business")).not.toMatch(/statement/);
    expect(userPayload(input()).length).toBeLessThan(4000);
  });

  it("backstops fundingNeeds from the user's words when Claude omits them", async () => {
    mocked.mockResolvedValue({ profilePatch: { projectIdea: "Un fotolibro" }, sectionUpdates: [], followUpQuestion: "¿Y?" });
    const r = await realOnboardingTurn(input("Quiero hacer un fotolibro y busco una beca de producción."));
    expect(r.profilePatch.fundingNeeds?.join(" ")).toMatch(/beca de producción/);
    mocked.mockResolvedValue({ profilePatch: { fundingNeeds: ["Una beca de producción"] }, sectionUpdates: [], followUpQuestion: "¿Y?" });
    expect((await realOnboardingTurn(input("Busco una beca de producción."))).profilePatch.fundingNeeds).toEqual(["Una beca de producción"]);
  });

  it("the schema warm-up is a no-op in mock mode", () => {
    warmOnboardingAi("creator");
    expect(mocked).not.toHaveBeenCalled();
  });
});
