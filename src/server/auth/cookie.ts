/** The session cookie: an opaque random token. The server stores only its sha256 (see ./users.ts). */
import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "mecena_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days

export const newSessionToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Reads the session token from a plain Request's cookie header (route handlers, and tests that build Requests). */
export function readSessionToken(req: Request): string | undefined {
  return parseCookie(req.headers.get("cookie"), SESSION_COOKIE);
}

export function parseCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    const v = part.slice(i + 1).trim();
    try {
      return decodeURIComponent(v) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production" });

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MAX_AGE_S });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}
