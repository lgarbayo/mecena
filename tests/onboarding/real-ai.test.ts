/** The real Claude path, with `structured()` mocked (no network, no key). */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/llm", async (orig) => {
  const mod = await orig<typeof import("@/server/ai/llm")>();
  return { ...mod, structured: vi.fn() };
});

import { AiError, structured } from "@/server/ai/llm";
import {
  ONBOARDING_DEADLINE_MS,
  ONBOARDING_MAX_TOKENS,
  ONBOARDING_TIMEOUT_MS,
  ONBOARDING_WARMUP_TIMEOUT_MS,
  realOnboardingTurn,
  warmOnboardingAi,
} from "@/features/onboarding/ai";
import { systemPrompt, userPayload, CONTEXT_SEGMENTS } from "@/features/onboarding/prompt";
import { blankCreator, FIXTURE_NOW } from "@/fixtures";
import { DOSSIER_LOOK_QUESTION } from "@/features/onboarding/copy";
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
        { key: "bio", mode: "append", body: "Soy ilustradora de A Coruña.", sourceSegmentIds: ["seg-new", "invented-id"] },
        { key: "cv", mode: "replace", body: "", sourceSegmentIds: [] },
      ],
      followUpQuestion: "¿Qué proyecto te gustaría financiar?",
    });
    const r = await realOnboardingTurn(input());
    const call = mocked.mock.calls[0][0];
    expect(call.tier).toBe("fast");
    expect(call.effort).toBe("low");
    // Fast onboarding model (Haiku 5.5, thinking off) with a bounded call: per-attempt timeout, one retry, hard deadline.
    expect(call.model).toBe("claude-haiku-5-5");
    expect(call.thinking).toBe("disabled");
    expect(call.timeoutMs).toBe(ONBOARDING_TIMEOUT_MS);
    expect(call.maxRetries).toBe(1);
    expect(call.deadlineMs).toBe(ONBOARDING_DEADLINE_MS);
    expect(call.maxTokens).toBe(ONBOARDING_MAX_TOKENS);
    expect(call.system).toMatch(/mode "append"/);
    expect(call.system).toMatch(/NUNCA inventes/);
    expect(call.system).toMatch(/statement \(Declaración artística\)/);
    const payload = JSON.parse(call.user as string);
    expect(payload.nuevoFragmento).toEqual({ id: "seg-new", texto: "Me llamo Antía Varela, soy ilustradora de A Coruña." });
    expect(payload.fragmentosAnteriores).toHaveLength(CONTEXT_SEGMENTS);
    expect(payload.seccionesActuales[0].key).toBe("bio");
    expect(payload.perfilActual.id).toBeUndefined();

    expect(r.profilePatch).toEqual({ displayName: "Antía Varela", city: "A Coruña", disciplines: ["ilustración"] });
    expect(r.sectionUpdates).toHaveLength(1);
    expect(r.sectionUpdates[0]).toMatchObject({ key: "bio", title: "Biografía", status: "draft", body: "Antes.\n\nSoy ilustradora de A Coruña." });
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

  it("the creator prompt covers every art and asks in the language of each one", () => {
    const sys = systemPrompt("creator");
    for (const f of ["musica", "artes-escenicas", "audiovisual", "literatura", "diseno", "artesania", "artes-visuales"]) expect(sys).toContain(`(${f})`);
    expect(sys).toMatch(/repertorio o canciones propias/);
    expect(sys).toMatch(/editoriales/);
    expect(sys).toMatch(/estrenos/);
    expect(sys).toMatch(/festivales/);
    expect(sys).toMatch(/sin dar por hecho que pinta/);
    expect(systemPrompt("business")).not.toMatch(/canciones/);
    const musician = { ...input(), profile: { ...blankCreator, disciplines: ["guitarrista"] } };
    expect(JSON.parse(userPayload(musician)).familia).toBe("musica");
    expect(JSON.parse(userPayload(input())).familia).toBeUndefined();
  });

  it("asks the optional dossier-look question once the core profile becomes complete", async () => {
    mocked.mockResolvedValue({ profilePatch: { fundingNeeds: ["grabar un disco"] }, sectionUpdates: [], followUpQuestion: "¿Dónde has tocado?" });
    const ready = { ...input("Quiero grabar un disco."), profile: { ...blankCreator, displayName: "Iria", city: "Vigo", disciplines: ["música"] } };
    expect((await realOnboardingTurn(ready)).followUpQuestion).toBe(DOSSIER_LOOK_QUESTION);
    const after = { ...ready, profile: { ...ready.profile, fundingNeeds: ["grabar un disco"] } };
    expect((await realOnboardingTurn(after)).followUpQuestion).toBe("¿Dónde has tocado?");
  });

  it("the schema warm-up is a no-op in mock mode", () => {
    warmOnboardingAi("creator");
    expect(mocked).not.toHaveBeenCalled();
  });

  it("the warm-up uses the turn's model with a long timeout and no retry", async () => {
    vi.stubEnv("MECENA_AI_MOCK", "0");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-never-sent"); // structured() is mocked: nothing leaves the process
    mocked.mockResolvedValue({});
    try {
      warmOnboardingAi("business");
      const call = mocked.mock.calls[0][0];
      expect(call).toMatchObject({ model: "claude-haiku-5-5", thinking: "disabled", timeoutMs: ONBOARDING_WARMUP_TIMEOUT_MS, maxRetries: 0 });
      expect(ONBOARDING_WARMUP_TIMEOUT_MS).toBeGreaterThan(43_000); // the cold compile measured ~43 s
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("MECENA_MODEL_ONBOARDING switches the model; thinking stays at the model default off Haiku", async () => {
    vi.stubEnv("MECENA_MODEL_ONBOARDING", "claude-sonnet-5-5");
    mocked.mockResolvedValue({ profilePatch: {}, sectionUpdates: [], followUpQuestion: "¿Y?" });
    try {
      await realOnboardingTurn(input());
      const call = mocked.mock.calls[0][0];
      expect(call.model).toBe("claude-sonnet-5-5");
      expect(call.thinking).toBeUndefined(); // "disabled" is a 400 on Sonnet 5.5
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a timeout (wrapped as AiError by structured()) still falls back to the mock", async () => {
    mocked.mockRejectedValue(new AiError("Request timed out.", "api"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await realOnboardingTurn(input());
    expect(r.profilePatch.displayName).toBe("Antía Varela");
  });
});
