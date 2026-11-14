/**
 * In-memory attempt counter for login/signup (single machine, so memory is enough). Sliding window per key
 * ("login:email:<email>", "login:ip:<ip>", same for "signup"). Restarting the server clears it, which is fine at this scale.
 */
import { TooManyRequestsError } from "@/contracts";

export const RATE_LIMIT = { attempts: 10, windowMs: 15 * 60_000 };

const hits = new Map<string, number[]>();

function recent(key: string, now: number): number[] {
  const list = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (list.length) hits.set(key, list);
  else hits.delete(key);
  return list;
}

/**
 * Check and count one attempt in a single synchronous step: throws TooManyRequestsError when any key already used up
 * its attempts in the window, otherwise records the attempt on every key straight away. Call it before any await, so
 * a burst of parallel requests cannot all pass the check before the first one is counted. Returns the timestamp
 * recorded, for refundAttempt.
 */
export function consumeAttempt(keys: string[], now = Date.now()): number {
  if (keys.some((k) => recent(k, now).length >= RATE_LIMIT.attempts)) throw new TooManyRequestsError();
  for (const k of keys) hits.set(k, [...recent(k, now), now]);
  return now;
}

/** Gives back an attempt consumeAttempt counted (a successful login does not use up the window). */
export function refundAttempt(keys: string[], at: number): void {
  for (const k of keys) {
    const list = hits.get(k);
    const i = list?.lastIndexOf(at) ?? -1;
    if (!list || i < 0) continue;
    list.splice(i, 1);
    if (!list.length) hits.delete(k);
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

/** Counters for one action (login and sign-up are counted apart), per email and per client IP. */
export const limitKeys = (action: "login" | "signup", req: Request, email: string) => [`${action}:email:${email}`, `${action}:ip:${clientIp(req)}`];
