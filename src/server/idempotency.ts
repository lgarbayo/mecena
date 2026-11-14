/**
 * Idempotency-Key support for mutating API routes (docs/design-system.md, "Idempotency").
 *
 *   export const POST = route(idempotent(async (req: Request) => { ... }));
 *
 * - No Idempotency-Key header: the handler runs exactly as before.
 * - Key: 1-128 chars of [A-Za-z0-9_\-:.], else 400.
 * - Scope: sha256(session cookie, else bearer token, else client IP) + method + pathname + key, so two users can
 *   never see each other's responses even with the same key.
 * - A completed response (< 24 h old) is replayed byte for byte with `Idempotent-Replayed: true`. A concurrent
 *   duplicate waits for the first one and gets its response. The same key with a different body is a 409.
 * - Not stored (the next try runs the handler again): 5xx, 429, thrown errors, bodies over 2 MB, responses that set
 *   cookies, and streams. Streams (`opts.stream`, or a text/event-stream response) only block concurrent duplicates
 *   (409 "Esta acción ya está en marcha.") until the stream ends.
 *
 * In memory (LRU): Fly runs Mecena on a single machine, so one process sees every request. With more machines this
 * would need a shared store.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { ApiError } from "@/contracts/api";
import { SESSION_COOKIE } from "./auth/cookie";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const REPLAYED_HEADER = "Idempotent-Replayed";
export const IDEMPOTENCY_MESSAGES = {
  invalidKey: "La clave de idempotencia no es válida.",
  mismatch: "Esta petición ya se envió con otros datos.",
  inProgress: "Esta acción ya está en marcha.",
} as const;

const KEY_RE = /^[A-Za-z0-9_\-:.]{1,128}$/;
const TTL_MS = 24 * 60 * 60 * 1000;
const STREAM_TTL_MS = 15 * 60 * 1000; // a stream that never reports its end stops blocking after this
const MAX_ENTRIES = 2000;
const MAX_STORED_BYTES = 2 * 1024 * 1024;

type Stored = { status: number; statusText: string; headers: [string, string][]; body: Uint8Array };
type Entry = {
  fingerprint: string;
  at: number;
  stream: boolean;
  stored?: Stored;
  /** Resolves when the first request finishes (stored or not). */
  done: Promise<void>;
};

const entries = new Map<string, Entry>();

/** Test hook: forget every key. */
export function resetIdempotency(): void {
  entries.clear();
}

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || undefined;
  }
  return undefined;
}

function identity(req: Request): string {
  const h = req.headers;
  const session = cookieValue(h.get("cookie"), SESSION_COOKIE);
  if (session) return `s:${session}`;
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(h.get("authorization") ?? "")?.[1];
  if (bearer) return `b:${bearer}`;
  return `ip:${h.get("fly-client-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"}`;
}

function live(scope: string): Entry | undefined {
  const e = entries.get(scope);
  if (!e) return undefined;
  const age = Date.now() - e.at;
  if (age > TTL_MS || (!e.stored && e.stream && age > STREAM_TTL_MS)) {
    entries.delete(scope);
    return undefined;
  }
  entries.delete(scope); // LRU: most recently used goes last
  entries.set(scope, e);
  return e;
}

function remember(scope: string, e: Entry) {
  entries.set(scope, e);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
}

const fail = (error: ApiError["error"], message: string, status: number) => NextResponse.json<ApiError>({ error, message }, { status });

function replay(s: Stored): Response {
  const headers = new Headers(s.headers);
  headers.set(REPLAYED_HEADER, "true");
  return new Response(s.body.byteLength ? s.body.slice() : null, { status: s.status, statusText: s.statusText, headers });
}

const isEventStream = (res: Response) => /^text\/event-stream/i.test(res.headers.get("content-type") ?? "");

/** Pass the stream through, calling `end` once it finishes, fails or is cancelled. */
function onStreamEnd(res: Response, end: () => void): Response {
  if (!res.body) {
    end();
    return res;
  }
  const reader = res.body.getReader();
  let ended = false;
  const finish = () => {
    if (!ended) {
      ended = true;
      end();
    }
  };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finish();
          controller.close();
        } else controller.enqueue(value);
      } catch (e) {
        finish();
        controller.error(e);
      }
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    },
  });
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

export function idempotent<A extends unknown[]>(
  handler: (req: Request, ...rest: A) => Promise<Response>,
  opts: { stream?: boolean } = {},
): (req: Request, ...rest: A) => Promise<Response> {
  return async (req: Request, ...rest: A): Promise<Response> => {
    const key = req.headers.get(IDEMPOTENCY_HEADER);
    if (key === null) return handler(req, ...rest);
    if (!KEY_RE.test(key)) return fail("bad_request", IDEMPOTENCY_MESSAGES.invalidKey, 400);

    const raw = new Uint8Array(await req.arrayBuffer());
    const fingerprint = sha256(raw);
    const scope = `${sha256(identity(req))} ${req.method} ${new URL(req.url).pathname} ${key}`;
    // The original body has been read: hand the handler an equivalent Request it can read again.
    const fresh = () =>
      new Request(req.url, { method: req.method, headers: req.headers, body: raw.byteLength ? raw : undefined, signal: req.signal });

    for (;;) {
      const existing = live(scope);
      if (!existing) break;
      if (existing.fingerprint !== fingerprint) return fail("conflict", IDEMPOTENCY_MESSAGES.mismatch, 409);
      if (existing.stored) return replay(existing.stored);
      if (existing.stream || opts.stream) return fail("conflict", IDEMPOTENCY_MESSAGES.inProgress, 409);
      await existing.done; // a concurrent duplicate: wait for the first, then replay it (or run if it was not kept)
    }

    let settle!: () => void;
    const entry: Entry = { fingerprint, at: Date.now(), stream: !!opts.stream, done: new Promise<void>((r) => (settle = r)) };
    remember(scope, entry);
    const forget = () => {
      if (entries.get(scope) === entry) entries.delete(scope);
      settle();
    };

    let res: Response;
    try {
      res = await handler(fresh(), ...rest);
    } catch (e) {
      forget();
      throw e;
    }

    if (opts.stream || isEventStream(res)) {
      entry.stream = true;
      return onStreamEnd(res, forget);
    }

    // Only successes are kept: a 402/409/4xx/5xx retried with the same key runs again (e.g. after a paywall purchase).
    const storable = res.ok && !res.headers.has("set-cookie");
    const declared = Number(res.headers.get("content-length"));
    if (!storable || (Number.isFinite(declared) && declared > MAX_STORED_BYTES)) {
      forget();
      return res;
    }
    let body: Uint8Array;
    try {
      body = new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      forget();
      throw e;
    }
    const headers: [string, string][] = [...res.headers.entries()];
    if (body.byteLength <= MAX_STORED_BYTES) {
      entry.stored = { status: res.status, statusText: res.statusText, headers, body };
      settle();
    } else forget();
    return new Response(body.byteLength ? body.slice() : null, { status: res.status, statusText: res.statusText, headers });
  };
}
