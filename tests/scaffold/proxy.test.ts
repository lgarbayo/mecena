import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const SESSION = "mecena_session=abc";
const req = (auth?: string, path = "/onboarding", cookie: string | null = SESSION) =>
  new NextRequest(`https://mecena.example${path}`, { headers: { ...(auth ? { authorization: auth } : {}), ...(cookie ? { cookie } : {}) } });
const basic = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;
// Generated per run: a literal here reads as a hardcoded secret to scanners.
const PASS = randomUUID();

describe("proxy basic auth", () => {
  afterEach(() => {
    delete process.env.BASIC_AUTH_PASSWORD;
    delete process.env.BASIC_AUTH_USER;
  });

  it("lets everything through when no password is configured", () => {
    expect(proxy(req()).status).toBe(200);
  });

  it("asks for credentials when a password is configured", () => {
    process.env.BASIC_AUTH_PASSWORD = PASS;
    const res = proxy(req());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Basic");
  });

  it("rejects a wrong password or user", () => {
    process.env.BASIC_AUTH_PASSWORD = PASS;
    expect(proxy(req(basic("mecena", `${PASS}x`))).status).toBe(401);
    expect(proxy(req(basic("other", PASS))).status).toBe(401);
    expect(proxy(req("Basic !!!not-base64")).status).toBe(401);
  });

  it("accepts the right credentials, with the default and a custom user", () => {
    process.env.BASIC_AUTH_PASSWORD = PASS;
    expect(proxy(req(basic("mecena", PASS))).status).toBe(200);
    process.env.BASIC_AUTH_USER = "luis";
    expect(proxy(req(basic("luis", PASS))).status).toBe(200);
  });

  it("basic auth still comes first: no session gate before the password", () => {
    process.env.BASIC_AUTH_PASSWORD = PASS;
    expect(proxy(req(undefined, "/entrar", null)).status).toBe(401);
  });
});

describe("proxy session gate", () => {
  it("pages without the session cookie redirect to /entrar?next=<path>", () => {
    const res = proxy(req(undefined, "/obras?x=1", null));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/entrar");
    expect(to.searchParams.get("next")).toBe("/obras?x=1");
  });

  it("API calls without the session cookie get 401 JSON", async () => {
    const res = proxy(req(undefined, "/api/profile", null));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
    expect(proxy(req(undefined, "/api/works/w1/image", null)).status).toBe(401);
  });

  it("public paths work without a session: /entrar, the opening screen, /confianza, /api/auth/*, /api/health, build assets and static files", () => {
    for (const p of ["/entrar", "/entrar?next=%2Fobras", "/", "/confianza", "/api/auth/login", "/api/auth/me", "/api/health", "/_next/static/chunk.js", "/favicon.ico", "/robots.txt", "/demo/obra.jpg"]) {
      expect(proxy(req(undefined, p, null)).status, p).toBe(200);
    }
  });

  it("only those: other pages under them still need a session", () => {
    for (const p of ["/confianza/x", "/convocatorias", "/demo", "/api/healthz", "/api/health/x"]) expect(proxy(req(undefined, p, null)).status, p).not.toBe(200);
  });

  it("the health check skips the Basic auth gate too (Fly sends no credentials)", () => {
    process.env.BASIC_AUTH_PASSWORD = PASS;
    try {
      expect(proxy(req(undefined, "/api/health", null)).status).toBe(200);
      expect(proxy(req(undefined, "/", null)).status).toBe(401);
    } finally {
      delete process.env.BASIC_AUTH_PASSWORD;
    }
  });

    it("with the cookie, pages and API pass (the session itself is validated by each route)", () => {
    expect(proxy(req(undefined, "/obras")).status).toBe(200);
    expect(proxy(req(undefined, "/api/profile")).status).toBe(200);
  });
});
