/**
 * Per-account plan-B switches in the AI layer: with a real key configured, an account with «Tribunal determinista»
 * gets only the jury on the deterministic mock, one with «IA simulada» gets every slice on mocks, and nobody else is
 * affected. No test here reaches the Anthropic API (the key is fake and only mocked paths are exercised).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as turnRoute } from "@/app/api/onboarding/turn/route";
import { bindAiAccount, currentAiSwitches, runWithAiSwitches } from "@/features/demo/ai-mode";
import { setDemoSettings } from "@/features/demo/settings";
import { juryAi } from "@/features/jury/ai";
import { draftingAi } from "@/features/drafting/ai";
import { getAi } from "@/server/ai";
import { isMockAi } from "@/server/ai/llm";
import { createUser, req } from "../helpers";

beforeEach(() => {
  // a "real" server: key present, mocks not forced
  process.env.ANTHROPIC_API_KEY = "sk-ant-fake-for-tests";
  process.env.MECENA_AI_MOCK = "";
});
afterEach(() => {
  process.env.ANTHROPIC_API_KEY = "";
  process.env.MECENA_AI_MOCK = "1";
});

/** A fresh async context, like a new incoming request (nothing bound yet). */
const asRequest = <T>(fn: () => Promise<T>) => runWithAiSwitches({}, fn);

describe("per-account AI switches", () => {
  it("off by default: the real slices and no override outside a request", async () => {
    expect(currentAiSwitches()).toEqual({ deterministicJury: false, aiMock: false });
    expect(isMockAi()).toBe(false);
    expect(getAi().mode).toBe("anthropic");
    expect(getAi().judgeApplication).not.toBe(juryAi.mock.judgeApplication);
  });

  it("«Tribunal determinista» swaps only the jury methods to the mock for that account", async () => {
    const { user } = await createUser("ana@example.com");
    setDemoSettings(user.id, { deterministicJury: true });
    await asRequest(async () => {
      bindAiAccount(user.id);
      await Promise.resolve();
      const ai = getAi();
      expect(ai.mode).toBe("anthropic");
      expect(ai.judgeApplication).toBe(juryAi.mock.judgeApplication);
      expect(ai.reviseApplication).toBe(juryAi.mock.reviseApplication);
      expect(ai.draftApplication).toBe(draftingAi.real.draftApplication); // drafting stays on Claude
      expect(isMockAi()).toBe(false);
    });
  });

  it("«IA simulada» puts every slice of that account on mocks, end to end through a real route", async () => {
    const a = await createUser("ana@example.com");
    setDemoSettings(a.user.id, { aiMock: true });
    const res = await asRequest(() => turnRoute(req("/api/onboarding/turn", { cookie: a.cookie, body: { text: "Me llamo Ana Souto, soy pintora de Lugo.", source: "text" } })));
    expect(res.status).toBe(200); // a real call with the fake key would have failed (502)
    await asRequest(async () => {
      bindAiAccount(a.user.id);
      expect(isMockAi()).toBe(true);
      expect(getAi().mode).toBe("mock");
    });
  });

  it("concurrent requests of two accounts never see each other's switches", async () => {
    const a = await createUser("ana@example.com");
    const b = await createUser("bea@example.com");
    setDemoSettings(a.user.id, { aiMock: true, deterministicJury: true });
    const seen = async (userId: string) =>
      asRequest(async () => {
        bindAiAccount(userId);
        await new Promise((r) => setTimeout(r, 5));
        const first = { ...currentAiSwitches(), mode: getAi().mode };
        await new Promise((r) => setImmediate(r));
        return [first, { ...currentAiSwitches(), mode: getAi().mode }];
      });
    const [ra, rb] = await Promise.all([seen(a.user.id), seen(b.user.id)]);
    for (const r of ra) expect(r).toEqual({ deterministicJury: true, aiMock: true, mode: "mock" });
    for (const r of rb) expect(r).toEqual({ deterministicJury: false, aiMock: false, mode: "anthropic" });
  });

  it("runWithAiSwitches forces a switch only inside its callback", async () => {
    await runWithAiSwitches({ deterministicJury: true }, async () => {
      await Promise.resolve();
      expect(getAi().judgeApplication).toBe(juryAi.mock.judgeApplication);
    });
    expect(getAi().judgeApplication).not.toBe(juryAi.mock.judgeApplication);
  });
});
