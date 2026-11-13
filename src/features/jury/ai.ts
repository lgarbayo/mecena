// STUB (scaffold). Owned by WP-09: real judges (tier "smart") + deterministic mock that scores v1 ~61 and v2+ ~84.
import type { AiSlice } from "@/contracts";

export const juryAi: AiSlice<"judgeApplication" | "reviseApplication"> = {
  mock: {
    async judgeApplication({ call, application, judge }) {
      const ratio = application.version >= 2 ? 0.84 : 0.61;
      return {
        judgeId: judge.id,
        scores: call.criteria.map((c) => ({ criterionId: c.id, points: Math.round(c.maxPoints * ratio), comment: "", fixes: [] })),
        overall: "",
      };
    },
    async reviseApplication({ application }) {
      return { sections: application.sections, budget: application.budget, checklist: application.checklist };
    },
  },
  real: {
    async judgeApplication(input) {
      return juryAi.mock.judgeApplication(input); // TODO(WP-09)
    },
    async reviseApplication(input) {
      return juryAi.mock.reviseApplication(input); // TODO(WP-09)
    },
  },
};
