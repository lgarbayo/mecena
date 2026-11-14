import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const req = (auth?: string) =>
  new NextRequest("https://mecena.example/onboarding", { headers: auth ? { authorization: auth } : {} });
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
});
