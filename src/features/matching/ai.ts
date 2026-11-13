// STUB (scaffold). Owned by WP-06: replace `real` with a Claude call (tier "fast") and improve `mock`.
import type { AiSlice } from "@/contracts";

export const matchingAi: AiSlice<"explainFit"> = {
  mock: {
    async explainFit({ call, ruleReasons, ruleMissing }) {
      return { whyYouFit: ruleReasons.slice(0, 4), whatYouMiss: ruleMissing.slice(0, 4), plainSummary: call.summary };
    },
  },
  real: {
    async explainFit(input) {
      return matchingAi.mock.explainFit(input); // TODO(WP-06)
    },
  },
};
