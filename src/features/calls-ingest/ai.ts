// STUB (scaffold). Owned by WP-05: replace `real` with a Claude call that structures bases text into a Call.
import type { AiSlice, Call } from "@/contracts";

export const callsIngestAi: AiSlice<"structureCall"> = {
  mock: {
    async structureCall({ rawText, sourceUrl, bdnsId }): Promise<Call> {
      return {
        id: `bdns-${bdnsId ?? "unknown"}`,
        title: rawText.slice(0, 80) || "Convocatoria",
        organizer: "Desconocido",
        type: "convocatoria",
        scope: "estatal",
        beneficiaryKinds: ["business"],
        disciplines: [],
        sectors: [],
        eligibility: { residence: [], legalForms: [], other: [] },
        amountEur: {},
        amountText: "Consultar bases",
        deadline: null,
        deadlineText: "Consultar bases",
        status: "open",
        summary: rawText.slice(0, 240),
        requiredDocuments: [],
        criteria: [],
        criteriaSource: "estimated",
        allowedExpenses: [],
        sourceUrl,
        bdnsId,
        source: "bdns",
        verifiedAt: new Date().toISOString().slice(0, 10),
      };
    },
  },
  real: {
    async structureCall(input) {
      return callsIngestAi.mock.structureCall(input); // TODO(WP-05)
    },
  },
};
