/** Idempotency-Key: server replay/dedupe/mismatch/no-store/isolation, and the client always sending the header. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { idempotent, IDEMPOTENCY_MESSAGES, resetIdempotency } from "@/server/idempotency";
import { apiSend, IDEMPOTENCY_HEADER } from "@/lib/api-client";

const post = (body: unknown, key: string | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/things", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "mecena_session=user-a", ...(key ? { [IDEMPOTENCY_HEADER]: key } : {}), ...headers },
    body: JSON.stringify(body),
  });

/** A handler that counts its runs and echoes the body it read. */
function counter(status = 200) {
  const calls = { n: 0 };
  const handler = idempotent(async (req: Request) => {
    calls.n += 1;
    const body = await req.json();
    await new Promise((r) => setTimeout(r, 10));
    return NextResponse.json({ run: calls.n, body }, { status });
  });
  return { calls, handler };
}

beforeEach(() => resetIdempotency());
afterEach(() => vi.restoreAllMocks());

describe("idempotent()", () => {
  it("replays a completed response without running the handler again", async () => {
    const { calls, handler } = counter();
    const first = await handler(post({ a: 1 }, "k-1"));
    const again = await handler(post({ a: 1 }, "k-1"));
    expect(calls.n).toBe(1);
    expect(await again.json()).toEqual(await first.json());
    expect(again.headers.get("Idempotent-Replayed")).toBe("true");
    expect(first.headers.get("Idempotent-Replayed")).toBeNull();
  });

  it("runs once for concurrent duplicates", async () => {
    const { calls, handler } = counter();
    const [a, b] = await Promise.all([handler(post({ a: 1 }, "k-2")), handler(post({ a: 1 }, "k-2"))]);
    expect(calls.n).toBe(1);
    expect(await a.json()).toEqual(await b.json());
  });

  it("refuses the same key with a different body (409)", async () => {
    const { handler } = counter();
    await handler(post({ a: 1 }, "k-3"));
    const res = await handler(post({ a: 2 }, "k-3"));
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe(IDEMPOTENCY_MESSAGES.mismatch);
  });

  it("does not store 5xx: a retry runs the handler again", async () => {
    const { calls, handler } = counter(503);
    await handler(post({ a: 1 }, "k-4"));
    await handler(post({ a: 1 }, "k-4"));
    expect(calls.n).toBe(2);
  });

  it("keeps users apart: the same key from another session runs on its own", async () => {
    const { calls, handler } = counter();
    await handler(post({ a: 1 }, "k-5"));
    const other = await handler(post({ a: 1 }, "k-5", { cookie: "mecena_session=user-b" }));
    expect(calls.n).toBe(2);
    expect(other.headers.get("Idempotent-Replayed")).toBeNull();
  });

  it("leaves requests without the header alone and rejects malformed keys", async () => {
    const { calls, handler } = counter();
    await handler(post({ a: 1 }, null));
    await handler(post({ a: 1 }, null));
    expect(calls.n).toBe(2);
    expect((await handler(post({ a: 1 }, "bad key!"))).status).toBe(400);
  });

  it("streams only block concurrent duplicates", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const handler = idempotent(
      async () =>
        new Response(
          new ReadableStream({
            async start(c) {
              await gate;
              c.enqueue(new TextEncoder().encode("data: hi\n\n"));
              c.close();
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
      { stream: true },
    );
    const first = await handler(post({}, "k-6"));
    const dup = await handler(post({}, "k-6"));
    expect(dup.status).toBe(409);
    expect((await dup.json()).message).toBe(IDEMPOTENCY_MESSAGES.inProgress);
    release();
    expect(await first.text()).toContain("hi");
    expect((await handler(post({}, "k-6"))).status).toBe(200);
  });
});

describe("apiSend", () => {
  it("always sends an Idempotency-Key, the given one when passed, and coalesces identical concurrent calls", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await apiSend("/api/x", { a: 1 });
      await apiSend("/api/x", { a: 1 }, "POST", undefined, { idempotencyKey: "mine" });
      const keys = fetchMock.mock.calls.map((c) => new Headers((c as unknown as [string, RequestInit])[1].headers).get(IDEMPOTENCY_HEADER));
      expect(keys[0]).toMatch(/^[A-Za-z0-9_\-:.]{1,128}$/);
      expect(keys[1]).toBe("mine");
      await Promise.all([apiSend("/api/y", { b: 1 }), apiSend("/api/y", { b: 1 })]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
