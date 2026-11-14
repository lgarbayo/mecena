/**
 * structured() request shape and per-request options against the REAL SDK, with `fetch` stubbed (no network, no key):
 * the onboarding model override, Haiku without server-side fallbacks, thinking off, SDK timeout / retries, the hard
 * deadline, and that an SDK timeout surfaces as AiError (so the onboarding mock fallback applies).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiError, structured, supportsServerFallback } from "@/server/ai/llm";

type Handler = (body: Record<string, unknown>, headers: Headers, signal: AbortSignal | undefined) => Promise<Response>;
let handler: Handler;
const requests: { body: Record<string, unknown>; headers: Headers }[] = [];

const fakeFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  const headers = new Headers(init?.headers);
  requests.push({ body, headers });
  return handler(body, headers, init?.signal ?? undefined);
});

const ok = (out: unknown, model = "claude-haiku-5-5") =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model,
        content: [{ type: "text", text: JSON.stringify(out) }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
/** Never answers; rejects like fetch does when the SDK aborts it on timeout. */
const hang: Handler = (_b, _h, signal) =>
  new Promise((_, reject) => signal?.addEventListener("abort", () => reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }))));

const schema = z.object({ ok: z.boolean() });
const base = { tier: "fast" as const, system: "s", user: "u", schema };

beforeAll(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key-never-sent");
  vi.stubGlobal("fetch", fakeFetch); // read once, when llm.ts creates its client on the first call below
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  requests.length = 0;
  fakeFetch.mockClear();
  handler = () => ok({ ok: true });
});

describe("structured(): request shape", () => {
  it("callers without the new options send exactly what they did before (tier model, fallbacks, no thinking field)", async () => {
    await expect(structured(base)).resolves.toEqual({ ok: true });
    const { body, headers } = requests[0];
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.fallbacks).toBe("default");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(body).not.toHaveProperty("thinking");
    expect(body.max_tokens).toBe(16000);
    expect(body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
  });

  it("onboarding: model override, Haiku without fallbacks, thinking disabled, effort low", async () => {
    await structured({ ...base, model: "claude-haiku-5-5", thinking: "disabled", effort: "low", maxTokens: 3000, timeoutMs: 20_000, maxRetries: 1, deadlineMs: 45_000 });
    const { body, headers } = requests[0];
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body).not.toHaveProperty("fallbacks"); // Haiku 5.5 has no server-side fallback (a fallback list is a 400)
    expect(headers.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.max_tokens).toBe(3000);
    expect(body.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } });
  });

  it("supportsServerFallback: only Haiku is excluded", () => {
    expect(supportsServerFallback("claude-haiku-5-5")).toBe(false);
    expect(supportsServerFallback("claude-sonnet-5-5")).toBe(true);
    expect(supportsServerFallback("claude-opus-5-5")).toBe(true);
  });
});

describe("structured(): timeouts and retries become AiError", () => {
  it("an SDK timeout (APIConnectionTimeoutError) is wrapped as AiError('api')", async () => {
    handler = hang;
    const err = await structured({ ...base, model: "claude-haiku-5-5", timeoutMs: 50, maxRetries: 0 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).reason).toBe("api");
    expect((err as AiError).message).toMatch(/timed out/i);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("maxRetries is per request: 1 retry = 2 attempts on timeout", async () => {
    handler = hang;
    await expect(structured({ ...base, model: "claude-haiku-5-5", timeoutMs: 40, maxRetries: 1 })).rejects.toBeInstanceOf(AiError);
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });

  it("the hard deadline cuts a long 429 retry-after (the SDK would otherwise wait 60 s)", async () => {
    handler = () => Promise.resolve(new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }), { status: 429, headers: { "retry-after": "60" } }));
    const t0 = Date.now();
    const err = await structured({ ...base, model: "claude-haiku-5-5", timeoutMs: 1000, maxRetries: 1, deadlineMs: 150 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("a 5xx is retried per maxRetries (0 = one attempt)", async () => {
    handler = () => Promise.resolve(new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } }), { status: 500 }));
    await expect(structured({ ...base, maxRetries: 0 })).rejects.toBeInstanceOf(AiError);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});
