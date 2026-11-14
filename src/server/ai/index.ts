/**
 * Composes the AiService from per-feature slices (scaffold-owned).
 * Builders implement their slice in src/features/<feature>/ai.ts; this file only wires them.
 */
import type { AiService } from "@/contracts";
import { onboardingAi } from "@/features/onboarding/ai";
import { worksAi } from "@/features/works/ai";
import { matchingAi } from "@/features/matching/ai";
import { callsIngestAi } from "@/features/calls-ingest/ai";
import { draftingAi } from "@/features/drafting/ai";
import { juryAi } from "@/features/jury/ai";
import { dossierAi } from "@/features/dossier/adapt-ai";
import { deepResearchAi } from "@/features/deep-research/ai";
import { isMockAi } from "./llm";

const slices = [onboardingAi, worksAi, matchingAi, callsIngestAi, draftingAi, juryAi, dossierAi, deepResearchAi];

export function getAi(forceMock = false): AiService {
  const mock = forceMock || isMockAi();
  const methods = Object.assign({}, ...slices.map((s) => (mock ? s.mock : s.real)));
  return { mode: mock ? "mock" : "anthropic", ...methods } as AiService;
}

/** Always the deterministic mocks (tests, offline demo fallback). */
export const mockAi = (): AiService => getAi(true);
