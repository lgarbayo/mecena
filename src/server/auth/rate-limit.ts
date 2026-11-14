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

/** Throws TooManyRequestsError when any key already used up its attempts in the window. */
export function assertNotLimited(keys: string[], now = Date.now()): void {
  if (keys.some((k) => recent(k, now).length >= RATE_LIMIT.attempts)) throw new TooManyRequestsError();
}

export function recordAttempt(keys: string[], now = Date.now()): void {
  for (const k of keys) hits.set(k, [...recent(k, now), now]);
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
