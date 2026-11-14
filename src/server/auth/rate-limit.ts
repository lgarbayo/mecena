/**
 * In-memory attempt counters (single machine, so memory is enough): sign-in, sign-up and every route that calls
 * Claude (src/server/ai-limits.ts). Sliding window per key. Restarting the server clears them, which is fine at
 * this scale (the AI also has a persisted global daily ceiling, src/server/ai/budget.ts).
 */
import { TooManyRequestsError } from "@/contracts";

export interface Limit {
  attempts: number;
  windowMs: number;
}

/** Default limit (and the one per email + IP for sign-in and sign-up). */
export const RATE_LIMIT: Limit = { attempts: 10, windowMs: 15 * 60_000 };
/**
 * Per client IP. A venue's Wi-Fi puts the whole audience behind one NAT address, so this one is much higher: it only
 * stops one machine from hammering the endpoint. Guessing one account is capped by the email + IP key instead.
 */
export const IP_RATE_LIMIT: Limit = { attempts: 100, windowMs: 15 * 60_000 };

/** On globalThis: Next bundles routes separately, and every route must see the same counters. */
const hits = ((globalThis as unknown as Record<symbol, unknown>)[Symbol.for("mecena.rate-limit")] ??= new Map<string, number[]>()) as Map<string, number[]>;

function recent(key: string, windowMs: number, now: number): number[] {
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length) hits.set(key, list);
  else hits.delete(key);
  return list;
}

export interface LimitedKey {
  key: string;
  limit: Limit;
}

/**
 * Check and count one attempt on every key in a single synchronous step: throws TooManyRequestsError (with `message`
 * when given) when any key already used up its attempts in its window, otherwise records the attempt on every key
 * straight away. Call it before any await, so a burst of parallel requests cannot all pass the check before the
 * first one is counted. Returns the timestamp recorded, for refundAttempt.
 */
export function consumeLimits(keys: LimitedKey[], now = Date.now(), message?: string): number {
  if (keys.some(({ key, limit }) => recent(key, limit.windowMs, now).length >= limit.attempts)) throw new TooManyRequestsError(message);
  for (const { key, limit } of keys) hits.set(key, [...recent(key, limit.windowMs, now), now]);
  return now;
}

/** consumeLimits with the same limit on every key (RATE_LIMIT by default). */
export function consumeAttempt(keys: string[], now = Date.now(), limit: Limit = RATE_LIMIT, message?: string): number {
  return consumeLimits(
    keys.map((key) => ({ key, limit })),
    now,
    message,
  );
}

/** Gives back an attempt consumeAttempt counted (a successful login or sign-up does not use up the window). */
export function refundAttempt(keys: (string | LimitedKey)[], at: number): void {
  for (const k of keys) {
    const key = typeof k === "string" ? k : k.key;
    const list = hits.get(key);
    const i = list?.lastIndexOf(at) ?? -1;
    if (!list || i < 0) continue;
    list.splice(i, 1);
    if (!list.length) hits.delete(key);
  }
}

/** Tests only. */
export function resetRateLimits(): void {
  hits.clear();
}

/** Client IP as Fly (or any proxy in front) reports it; "unknown" locally. */
export function clientIp(req: Request): string {
  const h = req.headers;
  return h.get("fly-client-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Counters for one action (login and sign-up are counted apart): per email from this IP (RATE_LIMIT), so nobody can
 * lock an account from elsewhere by failing its password, and per IP (IP_RATE_LIMIT, shared by a whole venue).
 */
export const limitKeys = (action: "login" | "signup", req: Request, email: string): LimitedKey[] => {
  const ip = clientIp(req);
  return [
    { key: `${action}:email-ip:${email}|${ip}`, limit: RATE_LIMIT },
    { key: `${action}:ip:${ip}`, limit: IP_RATE_LIMIT },
  ];
};
