/**
 * Optional HTTP Basic auth for public deploys (Fly.io). The app is single-user and every AI call
 * spends the owner's ANTHROPIC_API_KEY, so a public URL must not be open to anyone.
 * Enabled only when BASIC_AUTH_PASSWORD is set; local dev and tests run without it.
 */
import { NextResponse, type NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password) return NextResponse.next();
  const user = process.env.BASIC_AUTH_USER || "mecena";

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() === "basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const sep = decoded.indexOf(":");
      if (sep >= 0 && safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), password)) {
        return NextResponse.next();
      }
    } catch {
      // malformed base64: fall through to 401
    }
  }
  return new NextResponse("Autenticación necesaria", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Mecena", charset="UTF-8"' },
  });
}

export const config = {
  // Static build assets carry no data; everything else (pages, /api, uploads) needs the password.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
