/** Per-user rate limits on every route that calls Claude, input ceilings, and the global daily ceiling of AI requests. */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as onboardingTurn } from "@/app/api/onboarding/turn/route";
import { POST as onboardingImport } from "@/app/api/onboarding/import/route";
import { POST as createWork } from "@/app/api/works/route";
import { POST as describeWork } from "@/app/api/works/[id]/describe/route";
import { POST as agent } from "@/app/api/agent/route";
import { POST as draft } from "@/app/api/applications/route";
import { POST as jury } from "@/app/api/jury/route";
import { POST as juryImprove } from "@/app/api/jury/improve/route";
import { GET as dossier } from "@/app/api/dossier/route";
import { GET as dossierPdf } from "@/app/api/dossier/pdf/route";
import { POST as design } from "@/app/api/dossier/design/route";
import { POST as research } from "@/app/api/calls/research/route";
import { GET as callDetail } from "@/app/api/calls/[id]/route";
import { fixtureCalls } from "@/fixtures";
import { AI_LIMIT_MESSAGE, AI_ROUTE_LIMITS, AI_USER_DAILY_LIMIT, limitAi, type AiRoute } from "@/server/ai-limits";
import { aiCallsToday, DEFAULT_AI_DAILY_CAP, resetAiBudget, tryChargeAiCall } from "@/server/ai/budget";
import { AiBudgetError, structured } from "@/server/ai/llm";
import { getTranscript, dataDir } from "@/server/store";
import { DEMO_CREATOR_ID } from "@/fixtures";
import { z } from "zod";
import { createUser, ctx, grantPro, loginDemo, req, seedOnboardedCreator } from "../helpers";

const CALL = fixtureCalls[0].id;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Use up a route's window for this user, as a script would. */
function exhaust(user: { id: string }, route: AiRoute) {
  for (let i = 0; i < AI_ROUTE_LIMITS[route].attempts; i++) limitAi(user, route);
}

/** Every AI route, with a request that would otherwise call Claude. */
const ROUTES: [AiRoute, string, () => Promise<Response>][] = [
  ["onboarding-turn", "POST /api/onboarding/turn", () => onboardingTurn(req("/api/onboarding/turn", { body: { text: "Soy pintora", source: "text" } }))],
  ["onboarding-import", "POST /api/onboarding/import", () => onboardingImport(req("/api/onboarding/import", { body: { text: "Mi dossier" } }))],
  ["works-create", "POST /api/works", () => createWork(req("/api/works", { body: { imageDataUrl: PNG } }))],
  ["works-describe", "POST /api/works/[id]/describe", () => describeWork(req("/api/works/work-1/describe", { body: { voiceDescription: "Óleo, 2024" } }), ctx({ id: "work-1" }))],
  ["agent", "POST /api/agent", () => agent(req("/api/agent", { body: { message: "Busca convocatorias" } }))],
  ["draft", "POST /api/applications", () => draft(req("/api/applications", { body: { callId: CALL } }))],
  ["jury", "POST /api/jury", () => jury(req("/api/jury", { body: { applicationId: "x" } }))],
  ["jury-improve", "POST /api/jury/improve", () => juryImprove(req("/api/jury/improve", { body: { applicationId: "x", scoreId: "y" } }))],
  ["dossier-variant", "GET /api/dossier?callId (Pro)", () => dossier(req(`/api/dossier?callId=${CALL}`))],
  ["dossier-variant", "GET /api/dossier/pdf?callId (Pro)", () => dossierPdf(req(`/api/dossier/pdf?callId=${CALL}`))],
  ["dossier-design", "POST /api/dossier/design", () => design(req("/api/dossier/design", { body: { request: "Más sobrio" } }))],
  ["deep-research", "POST /api/calls/research", () => research(req("/api/calls/research", { body: {} }))],
  ["call-detail", "GET /api/calls/[id]", () => callDetail(req(`/api/calls/${CALL}`), ctx({ id: CALL }))],
];

describe("per-user AI rate limits", () => {
  it.each(ROUTES)("%s: %s answers 429 in Spanish once the user's window is used up", async (route, _label, call) => {
    const { user } = await loginDemo();
    await seedOnboardedCreator();
    await grantPro();
    exhaust(user, route);
    const res = await call();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too_many_requests", message: AI_LIMIT_MESSAGE });
  });

  it("the limit is per user: another account is not affected", async () => {
    const { user } = await loginDemo();
    exhaust(user, "onboarding-turn");
    const other = await createUser("otra@mecena.test");
    const res = await onboardingTurn(req("/api/onboarding/turn", { body: { text: "Soy escultora", source: "text" }, cookie: other.cookie }));
    expect(res.status).toBe(200);
  });

  it("a limited turn spends nothing: no transcript segment is saved", async () => {
    const { user } = await loginDemo();
    const before = getTranscript(DEMO_CREATOR_ID).length;
    exhaust(user, "onboarding-turn");
    expect((await onboardingTurn(req("/api/onboarding/turn", { body: { text: "Hola", source: "text" } }))).status).toBe(429);
    expect(getTranscript(DEMO_CREATOR_ID)).toHaveLength(before);
  });

  it("a live demo never gets near them: a 60 s voice onboarding is far below the turn limit", () => {
    expect(AI_ROUTE_LIMITS["onboarding-turn"].attempts).toBeGreaterThanOrEqual(60);
    expect(AI_ROUTE_LIMITS.jury.attempts).toBeGreaterThanOrEqual(20);
  });

  it("all AI routes together share a daily allowance per user", () => {
    const user = { id: "user-x" };
    const t0 = Date.now();
    const routes = Object.keys(AI_ROUTE_LIMITS) as AiRoute[];
    let used = 0;
    // spread over the day (each route's own window is short), so only the daily allowance can stop it
    for (let i = 0; used < AI_USER_DAILY_LIMIT.attempts; i++) {
      limitAi(user, routes[i % routes.length], t0 + i * 60_000);
      used++;
    }
    expect(() => limitAi(user, "jury", t0 + used * 60_000)).toThrow(AI_LIMIT_MESSAGE);
  });
});

describe("input ceilings", () => {
  it("agent: message and history are bounded", async () => {
    await loginDemo();
    const long = await agent(req("/api/agent", { body: { message: "x".repeat(4001) } }));
    expect(long.status).toBe(400);
    const history = Array.from({ length: 21 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "hola" }));
    const res = await agent(req("/api/agent", { body: { message: "sigue", history } }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/conversación es demasiado larga/);
    const bigTurn = await agent(req("/api/agent", { body: { message: "sigue", history: [{ role: "user", content: "x".repeat(4001) }] } }));
    expect(bigTurn.status).toBe(400);
  });

  it("works: the voice note is bounded too", async () => {
    await loginDemo();
    const res = await createWork(req("/api/works", { body: { imageDataUrl: PNG, voiceDescription: "x".repeat(4001) } }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/demasiado largo/);
  });
});

describe("global daily ceiling of Claude requests", () => {
  afterEach(() => {
    delete process.env.MECENA_AI_DAILY_CAP;
    resetAiBudget();
  });

  it("counts every request and stops at the ceiling", () => {
    process.env.MECENA_AI_DAILY_CAP = "3";
    expect([tryChargeAiCall(), tryChargeAiCall(), tryChargeAiCall(), tryChargeAiCall()]).toEqual([true, true, true, false]);
    expect(aiCallsToday()).toBe(3);
  });

  it("survives a restart (persisted on the data dir) and starts again the next day", () => {
    process.env.MECENA_AI_DAILY_CAP = "1";
    const today = new Date("2026-11-14T12:00:00Z");
    expect(tryChargeAiCall(today)).toBe(true);
    resetAiBudget(); // a deploy restarts the process
    expect(tryChargeAiCall(today)).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dataDir(), "ai-usage.json"), "utf8"))).toEqual({ day: "2026-11-14", count: 1 });
    expect(tryChargeAiCall(new Date("2026-11-15T12:00:00Z"))).toBe(true);
  });

  it("0 turns it off; the default is generous", () => {
    process.env.MECENA_AI_DAILY_CAP = "0";
    for (let i = 0; i < 5; i++) expect(tryChargeAiCall()).toBe(true);
    delete process.env.MECENA_AI_DAILY_CAP;
    expect(DEFAULT_AI_DAILY_CAP).toBeGreaterThanOrEqual(1000);
  });

  it("structured() refuses before contacting Claude once the ceiling is reached", async () => {
    process.env.MECENA_AI_DAILY_CAP = "1";
    tryChargeAiCall();
    const spy = vi.fn();
    await expect(structured({ tier: "fast", system: "s", user: "u", schema: z.object({ a: z.string() }) }).then(spy)).rejects.toBeInstanceOf(AiBudgetError);
    expect(spy).not.toHaveBeenCalled();
  });
});
