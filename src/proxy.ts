/**
 * Two gates, in order:
 * 1. Optional HTTP Basic auth for the whole site (BASIC_AUTH_PASSWORD; unset = off, local dev and tests run without it).
 *    Only Fly's health check (/api/health) skips it.
 * 2. Accounts: without the session cookie, pages redirect to /entrar?next=<path> and /api/* answers 401 JSON.
 *    Public: /entrar, the opening screen (/) and /confianza (PUBLIC_PAGES), /api/auth/*, /api/health, Next build
 *    assets and static files. This is only an optimistic check of the cookie's presence; every route handler and page
 *    validates the session itself (src/server/auth) before touching data.
 * The remote MCP endpoint (/api/mcp) skips both: it has its own `Authorization: Bearer <personal token>` (which Basic
 * auth would also claim) and its handler rejects any request without a valid token (src/mcp/http.ts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { API, PUBLIC_PAGES } from "@/contracts/routes";

/** Same name as src/server/auth/cookie.ts (not imported: that module pulls node:crypto, the proxy stays light). */
const SESSION_COOKIE = "mecena_session";
const LOGIN = "/entrar";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function basicAuth(request: NextRequest): NextResponse | undefined {
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password) return undefined;
  const user = process.env.BASIC_AUTH_USER || "mecena";

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() === "basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const sep = decoded.indexOf(":");
      if (sep >= 0 && safeEqual(decoded.slice(0, sep), user) && safeEqual(decoded.slice(sep + 1), password)) {
        return undefined;
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

const MCP = "/api/mcp";
const isMcpPath = (pathname: string) => pathname === MCP || pathname === `${MCP}/`;

/** Paths that work without an account. */
function isPublicPath(pathname: string): boolean {
  if (pathname === LOGIN || pathname.startsWith(`${LOGIN}/`)) return true;
  if (PUBLIC_PAGES.includes(pathname) || pathname === API.health) return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") return true;
  // Static files from public/ (robots.txt, icons, demo images…): a dot in the last segment, outside the API.
  if (!pathname.startsWith("/api/") && /\.[a-z0-9]+$/i.test(pathname.split("/").pop() ?? "")) return true;
  return false;
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === API.health) return NextResponse.next(); // Fly's health check: no credentials
  if (isMcpPath(request.nextUrl.pathname)) return NextResponse.next(); // token auth in the route handler
  const denied = basicAuth(request);
  if (denied) return denied;

  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname) || request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized", message: "Inicia sesión para continuar." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = LOGIN;
  url.search = pathname === "/" && !search ? "" : `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Static build assets carry no data; everything else (pages, /api, uploads) goes through both gates.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
