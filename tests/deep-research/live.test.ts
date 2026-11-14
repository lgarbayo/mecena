/**
 * Opt-in smoke test against the real API with web search (skipped by default; it spends real money). Run with:
 *   MECENA_LIVE_TESTS=1 ANTHROPIC_API_KEY=… npx vitest run tests/deep-research/live.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureCreator } from "@/fixtures";
import { deepResearchAi } from "@/features/deep-research/ai";
import { candidatesToCalls } from "@/features/deep-research/service";

const key = process.env.MECENA_LIVE_ANTHROPIC_API_KEY;
const live = process.env.MECENA_LIVE_TESTS === "1" && !!key;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());

describe.skipIf(!live)("deep research against the real API", () => {
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = key;
    process.env.MECENA_AI_MOCK = "0";
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = "";
    process.env.MECENA_AI_MOCK = "1";
  });

  it("finds private calls with real source URLs within the caps", async () => {
    const r = await deepResearchAi.real.deepResearch({ profile: fixtureCreator, today, maxSearches: 3, maxOutputTokens: 8000, maxTotalTokens: 150_000 });
    expect(r.searches).toBeLessThanOrEqual(3);
    expect(r.sourceUrls.length).toBeGreaterThan(0);
    const { calls } = candidatesToCalls(r.candidates, { today, sourceUrls: r.sourceUrls });
    for (const c of calls) {
      expect(c.source).toBe("web");
      expect(!c.deadline || c.deadline >= today).toBe(true);
    }
  }, 300_000);
});
