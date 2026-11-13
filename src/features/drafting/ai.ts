// STUB (scaffold). Owned by WP-08: replace `real` with a Claude call (tier "smart") that drafts from the user's own words.
import type { AiSlice } from "@/contracts";

export const draftingAi: AiSlice<"draftApplication"> = {
  mock: {
    async draftApplication({ profile, call, transcript }) {
      return {
        sections: [
          {
            key: "memoria",
            title: "Memoria del proyecto",
            body: profile.projectIdea || transcript.map((s) => s.text).join(" ") || "Pendiente",
            sourceSegmentIds: transcript.map((s) => s.id),
          },
        ],
        budget: [],
        checklist: call.requiredDocuments.map((item) => ({ item, done: false })),
      };
    },
  },
  real: {
    async draftApplication(input) {
      return draftingAi.mock.draftApplication(input); // TODO(WP-08)
    },
  },
};
