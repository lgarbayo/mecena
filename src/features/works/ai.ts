// STUB (scaffold). Owned by WP-02: replace `real` with a Claude vision call (llm.structured + imageBlock, tier "fast").
import type { AiSlice } from "@/contracts";

export const worksAi: AiSlice<"describeWork"> = {
  mock: {
    async describeWork({ voiceDescription }) {
      return {
        sheet: { title: voiceDescription?.split(/[.,]/)[0]?.trim() || "Sin título", concept: voiceDescription },
        crop: { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 },
        confidence: 0.5,
      };
    },
  },
  real: {
    async describeWork(input) {
      return worksAi.mock.describeWork(input); // TODO(WP-02)
    },
  },
};
