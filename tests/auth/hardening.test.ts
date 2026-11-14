/** Hardening of the sign-in flow: ?next open redirects, parallel login guesses, cross-site (CSRF) login/sign-up. */
import { describe, expect, it } from "vitest";
import { loginUrl, safeNext } from "@/contracts";

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
