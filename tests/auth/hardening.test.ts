/** Hardening of the sign-in flow: ?next open redirects, parallel login guesses, cross-site (CSRF) login/sign-up. */
import { describe, expect, it } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as patchMode } from "@/app/api/profile/mode/route";
import { loginUrl, safeNext } from "@/contracts";
import { RATE_LIMIT } from "@/server/auth/rate-limit";
import { readDb } from "@/server/store";
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

describe("cross-site (CSRF) login and sign-up", () => {
  /** What <form enctype="text/plain"> on another site sends: name={"email":...,"z":" and value="} -> valid JSON text. */
  const formPost = (url: string, payload: Record<string, unknown>, headers: Record<string, string>) =>
    new Request(`http://localhost:3000${url}`, { method: "POST", headers, body: JSON.stringify(payload) });

  it("a text/plain form posting JSON-looking text cannot sign in or sign up", async () => {
    await createUser("attacker@example.com");
    const asForm = { "content-type": "text/plain" };
    const res = await login(formPost("/api/auth/login", { email: "attacker@example.com", password: TEST_PASSWORD }, asForm));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
    const before = readDb().users.length;
    const up = await signup(formPost("/api/auth/signup", { email: "nuevo@example.com", password: TEST_PASSWORD }, asForm));
    expect(up.status).toBe(403);
    expect(readDb().users).toHaveLength(before);
    // urlencoded / multipart / no content type at all: same
    for (const ct of ["application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""]) {
      const r = await login(formPost("/api/auth/login", { email: "attacker@example.com", password: TEST_PASSWORD }, ct ? { "content-type": ct } : {}));
      expect(r.status).toBe(403);
    }
  });

  it("a browser request marked Sec-Fetch-Site: cross-site is refused even as JSON", async () => {
    await createUser("x@example.com");
    const headers = { "content-type": "application/json", "sec-fetch-site": "cross-site" };
    expect((await login(formPost("/api/auth/login", { email: "x@example.com", password: TEST_PASSWORD }, headers))).status).toBe(403);
  });

  it("same-origin JSON (what the app sends) still works, and so do authenticated routes", async () => {
    await createUser("ok@example.com");
    const ok = await login(formPost("/api/auth/login", { email: "ok@example.com", password: TEST_PASSWORD }, { "content-type": "application/json; charset=utf-8", "sec-fetch-site": "same-origin" }));
    expect(ok.status).toBe(200);
    const { cookie } = await createUser("mode@example.com");
    expect((await patchMode(req("/api/profile/mode", { body: { kind: "business" }, cookie }))).status).toBe(200);
    // and a text/plain body on an authenticated route is refused too
    const plain = await patchMode(req("/api/profile/mode", { body: { kind: "business" }, cookie, headers: { "content-type": "text/plain" } }));
    expect(plain.status).toBe(403);
  });
});
