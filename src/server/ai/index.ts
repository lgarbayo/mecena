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
import { justificationAi } from "@/features/justification/ai";
import { deepResearchAi } from "@/features/deep-research/ai";
import { currentAiSwitches } from "@/features/demo/ai-mode";
import { isMockAi } from "./llm";

const slices = [onboardingAi, worksAi, matchingAi, callsIngestAi, draftingAi, juryAi, dossierAi, deepResearchAi, justificationAi];

export function getAi(forceMock = false): AiService {
  const mock = forceMock || isMockAi();
  const methods = Object.assign({}, ...slices.map((s) => (mock ? s.mock : s.real)));
  // Plan B from /demo ("Tribunal determinista"): only the jury runs on the deterministic mock (61 → 84) for this account.
  if (!mock && currentAiSwitches().deterministicJury) Object.assign(methods, juryAi.mock);
  return { mode: mock ? "mock" : "anthropic", ...methods } as AiService;
}

/** Always the deterministic mocks (tests, offline demo fallback). */
export const mockAi = (): AiService => getAi(true);
