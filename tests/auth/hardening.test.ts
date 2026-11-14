/** Hardening of the sign-in flow: ?next open redirects, parallel login guesses, cross-site (CSRF) login/sign-up. */
import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { loginUrl, safeNext } from "@/contracts";
import { RATE_LIMIT } from "@/server/auth/rate-limit";
import { createUser, req, TEST_PASSWORD } from "../helpers";

describe("safeNext (?next after signing in)", () => {
  it("keeps same-site paths, normalised", () => {
    expect(safeNext("/obras")).toBe("/obras");
    expect(safeNext("/convocatorias/abc?q=pintura#top")).toBe("/convocatorias/abc?q=pintura#top");
    expect(safeNext("/solicitud/a%20b")).toBe("/solicitud/a%20b");
    expect(safeNext("/a/../obras")).toBe("/obras");
  });

  it.each([
    ["/\t/evil.com"],
    ["/\n/evil.com"],
    ["/\r/evil.com"],
    ["/\t\\evil.com"],
    ["/\\evil.com"],
    ["/obras\\..\\..\\evil.com"],
    ["//evil.com"],
    ["/.//evil.com"],
    ["/%2e//evil.com"],
    ["https://evil.com/"],
    ["evil.com"],
    ["javascript:alert(1)"],
    ["/\u0000x"],
    ["/\u007f/evil.com"],
    [""],
    [null],
    [undefined],
  ])("refuses %j", (next) => {
    expect(safeNext(next)).toBe("/");
  });

  it("whatever it returns, the browser resolves to this origin", () => {
    const base = "https://mecena.fly.dev/entrar";
    for (const raw of ["/%09/evil.com", "/%0A/evil.com", "/%0D/evil.com", "/%5Cevil.com", "/%09%5Cevil.com", "/./%2F%2Fevil.com"]) {
      const next = safeNext(decodeURIComponent(raw));
      expect(new URL(next, base).origin).toBe("https://mecena.fly.dev");
    }
  });

  it("never points back at the sign-in page itself", () => {
    expect(safeNext("/entrar")).toBe("/");
    expect(safeNext("/entrar?next=/obras")).toBe("/");
    expect(safeNext("/./entrar")).toBe("/");
    expect(loginUrl("/\t/evil.com")).toBe("/entrar");
    expect(loginUrl("/obras")).toBe("/entrar?next=%2Fobras");
  });
});

describe("login rate limit under parallel requests", () => {
  it(`a burst of parallel wrong guesses gets at most ${RATE_LIMIT.attempts} tries, the rest 429`, async () => {
    await createUser("burst@example.com");
    const n = RATE_LIMIT.attempts * 3;
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) => login(req("/api/auth/login", { body: { email: "burst@example.com", password: `mal-${i}-xxxx` }, cookie: null }))),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(RATE_LIMIT.attempts);
    expect(statuses.filter((s) => s === 429)).toHaveLength(n - RATE_LIMIT.attempts);
  });

  it("successful logins do not use up the window", async () => {
    await createUser("often@example.com");
    for (let i = 0; i < RATE_LIMIT.attempts + 2; i++) {
      expect((await login(req("/api/auth/login", { body: { email: "often@example.com", password: TEST_PASSWORD }, cookie: null }))).status).toBe(200);
    }
  });
});
