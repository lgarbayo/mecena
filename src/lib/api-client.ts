/**
 * Browser fetch helpers (scaffold-owned). Throws ApiClientError; status 402 means "show the paywall".
 * A 401 (no session, or it expired) sends the browser to /entrar?next=<here> (except on /entrar itself).
 */
import type { ApiError } from "@/contracts/api";
import { loginUrl, ROUTES } from "@/contracts/routes";

/** Go to the sign-in page, coming back here afterwards. No-op on the server and on /entrar. */
export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname.startsWith(ROUTES.login)) return;
  window.location.assign(loginUrl(`${pathname}${search}`));
}

export class ApiClientError extends Error {
  constructor(readonly status: number, readonly code: ApiError["error"] | "network", message: string) {
    super(message);
    this.name = "ApiClientError";
  }
  get paymentRequired() {
    return this.status === 402;
  }
}

async function handle<T>(res: Response, opts: { redirectOn401?: boolean } = {}): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const err = (await res.json().catch(() => null)) as ApiError | null;
  if (res.status === 401 && opts.redirectOn401 !== false) redirectToLogin();
  throw new ApiClientError(res.status, err?.error ?? "internal", err?.message ?? `Error ${res.status}`);
}

/** `redirectOn401: false`: a 401 just throws (public pages, which also work signed out). */
export async function apiGet<T>(url: string, opts: { redirectOn401?: boolean } = {}): Promise<T> {
  return handle<T>(await fetch(url, { cache: "no-store" }), opts);
}

/** Header that makes a mutation safe to retry: the server replays the first response (src/server/idempotency.ts). */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/** A fresh idempotency key (one per user intent; reuse it when retrying that same intent). */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Identical mutations already on the wire (same method, url, body and explicit key): callers share one request. */
const inFlight = new Map<string, Promise<unknown>>();

const isAbort = (e: unknown, signal?: AbortSignal) => signal?.aborted || (e instanceof Error && e.name === "AbortError");

/** fetch, retried once with the same key when the network drops (TypeError), never after an abort. */
async function sendOnce(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (isAbort(e, init.signal ?? undefined) || !(e instanceof TypeError)) throw e;
    return fetch(url, init); // same headers, so the same Idempotency-Key: the server dedupes if the first one landed
  }
}

/**
 * A JSON mutation. Always sends an Idempotency-Key (`opts.idempotencyKey`, or a fresh one), so a retry never double-
 * applies. Concurrent identical calls without a `signal` are coalesced into one request (double taps, double effects);
 * calls with a signal are cancellable on their own and are not shared.
 */
export async function apiSend<T>(
  url: string,
  body: unknown,
  method: "POST" | "PATCH" | "DELETE" = "POST",
  signal?: AbortSignal,
  opts: { idempotencyKey?: string } = {},
): Promise<T> {
  const payload = JSON.stringify(body);
  const key = opts.idempotencyKey ?? newIdempotencyKey();
  const exec = async () =>
    handle<T>(await sendOnce(url, { method, headers: { "content-type": "application/json", [IDEMPOTENCY_HEADER]: key }, body: payload, signal }));
  if (signal) return exec();
  const id = `${method} ${url}\n${opts.idempotencyKey ?? ""}\n${payload}`;
  const shared = inFlight.get(id);
  if (shared) return shared as Promise<T>;
  const p = exec().finally(() => inFlight.delete(id));
  inFlight.set(id, p);
  return p;
}

/** Read a File/Blob as a data: URL (photos -> POST /api/works). */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
