/**
 * Opt-in smoke test against the real API (skipped by default): one onboarding turn per profile kind must come back
 * from Claude, not from the deterministic fallback. Run with:
 *   MECENA_LIVE_TESTS=1 ANTHROPIC_API_KEY=… npx vitest run tests/onboarding/live.test.ts
 * (tests/setup.ts blanks ANTHROPIC_API_KEY for every test and keeps it aside as MECENA_LIVE_ANTHROPIC_API_KEY.)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OnboardingTurnInput, ProfileKind } from "@/contracts";
import { blankCreator, FIXTURE_NOW } from "@/fixtures";
import { realOnboardingTurn } from "@/features/onboarding/ai";

const key = process.env.MECENA_LIVE_ANTHROPIC_API_KEY;
const live = process.env.MECENA_LIVE_TESTS === "1" && !!key;

const FRAGMENTS: Record<ProfileKind, string> = {
  creator: "hola me llamo uxía ferreiro y soy pintora vivo en o corgo cerca de lugo",
  business: "se llama conservas da ría es una sociedad limitada que montamos en 2019 en boiro",
};

function input(kind: ProfileKind): OnboardingTurnInput {
  const newSegment = { id: "seg-live", text: FRAGMENTS[kind], source: "voice" as const, at: FIXTURE_NOW };
  return { kind, profile: { ...blankCreator, kind }, sections: [], transcript: [newSegment], newSegment };
}

describe.skipIf(!live)("onboarding turn against the real API", () => {
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = key;
    process.env.MECENA_AI_MOCK = "0";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = "";
    process.env.MECENA_AI_MOCK = "1";
  });

  it.each<ProfileKind>(["business", "creator"])("%s: Claude answers (no fallback) without sentinels in the patch", async (kind) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await realOnboardingTurn(input(kind));
      expect(warn).not.toHaveBeenCalled();
      expect(r.followUpQuestion).toBeTruthy();
      for (const v of Object.values(r.profilePatch)) expect(v === "" || v === 0 || (Array.isArray(v) && !v.length)).toBe(false);
      if (kind === "business") {
        expect(r.profilePatch.legalForm).toBe("sl");
        expect(r.profilePatch.foundedYear).toBe(2019);
        expect(r.profilePatch).not.toHaveProperty("employees");
      } else {
        expect(r.profilePatch.displayName).toMatch(/Uxía Ferreiro/i);
      }
    } finally {
      warn.mockRestore();
    }
  }, 180_000);
});
