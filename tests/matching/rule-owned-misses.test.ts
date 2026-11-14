import { describe, expect, it, vi } from "vitest";
import { DEMO_CREATOR_ID, fixtureCreator } from "@/fixtures";
import { explainCall, ruleMatch } from "@/features/matching/service";
import { getCall, getProfile, saveProfile } from "@/server/store";

// The model words the "why" and the summary; what is missing or to confirm is always the rules' list, word for word.
vi.mock("@/server/ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/ai")>();
  return {
    ...real,
    getAi: () => ({
      ...real.getAi(),
      mode: "real",
      explainFit: async () => ({ whyYouFit: ["Es perfecta para ti"], whatYouMiss: ["No te falta nada."], plainSummary: "Resumen." }),
    }),
  };
});

describe("explainCall", () => {
  it("never lets the model drop or soften what is missing", async () => {
    await saveProfile(structuredClone(fixtureCreator));
    const expected = ruleMatch(getProfile(DEMO_CREATOR_ID), getCall("fixture-beca-artes-plasticas")).whatYouMiss;
    const first = await explainCall({ callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID });
    expect(first.match.whyYouFit).toEqual(["Es perfecta para ti"]);
    expect(first.match.whatYouMiss).toEqual(expected);
    const cached = await explainCall({ callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID });
    expect(cached.match.whatYouMiss).toEqual(expected);
  });
});
