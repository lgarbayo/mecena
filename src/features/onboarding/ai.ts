// STUB (scaffold). Owned by WP-01: replace `real` with a Claude call (llm.structured, tier "fast") and improve `mock`.
import type { AiSlice, DossierSection } from "@/contracts";

export const onboardingAi: AiSlice<"onboardingTurn"> = {
  mock: {
    async onboardingTurn({ kind, newSegment }) {
      const key = kind === "creator" ? "bio" : "activity";
      const section: DossierSection = {
        key,
        title: kind === "creator" ? "Biografía" : "Actividad",
        body: newSegment.text,
        sourceSegmentIds: [newSegment.id],
        status: "draft",
        updatedAt: newSegment.at,
      };
      return { profilePatch: {}, sectionUpdates: [section], followUpQuestion: "¿Qué proyecto te gustaría financiar?" };
    },
  },
  real: {
    async onboardingTurn(input) {
      return onboardingAi.mock.onboardingTurn(input); // TODO(WP-01)
    },
  },
};
