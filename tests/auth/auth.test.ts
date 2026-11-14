/** Accounts: sign-up, login, logout, me, invite code, rate limit, cookies and what is stored. */
import { describe, expect, it, vi } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as config } from "@/app/api/auth/config/route";
import { DEMO_BUSINESS_ID, DEMO_CREATOR_ID } from "@/fixtures";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { RATE_LIMIT } from "@/server/auth/rate-limit";
import { readDb, updateDb } from "@/server/store";
import { req, TEST_PASSWORD } from "../helpers";

/** "mecena_session=<token>" from a response's Set-Cookie (what the browser would send back). */
function cookieFrom(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  const m = /mecena_session=([^;]*)/.exec(set);
  if (!m) throw new Error(`no session cookie in: ${set}`);
  return `mecena_session=${m[1]}`;
}

const signupReq = (body: Record<string, unknown>, headers?: Record<string, string>) => req("/api/auth/signup", { body, cookie: null, headers });
const loginReq = (body: Record<string, unknown>, headers?: Record<string, string>) => req("/api/auth/login", { body, cookie: null, headers });

describe("passwords", () => {
  it("scrypt with a random salt and its parameters; verify is exact", async () => {
    const a = await hashPassword("contraseña segura");
    const b = await hashPassword("contraseña segura");
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b); // different salts
    expect(await verifyPassword("contraseña segura", a)).toBe(true);
    expect(await verifyPassword("contraseña segurA", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("POST /api/auth/signup", () => {
  it("creates the account with its own blank creator profile, signs in, and stores only hashes", async () => {
    const res = await signup(signupReq({ email: "  Antia@Example.COM ", password: TEST_PASSWORD }));
    expect(res.status).toBe(201);
    const set = res.headers.get("set-cookie")!;
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(set).toMatch(/Path=\//);
    expect(set).toMatch(/Max-Age=2592000/);
    expect(set).not.toMatch(/Secure/i); // only in production
    const body = await res.json();
    expect(body.user.email).toBe("antia@example.com");
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.profile).toMatchObject({ kind: "creator", ownerId: body.user.id, displayName: "" });
    expect([DEMO_CREATOR_ID, DEMO_BUSINESS_ID]).not.toContain(body.profile.id);
    expect(body.appUserId).toMatch(/^mecena-/);

    const db = readDb();
    const user = db.users.find((u) => u.id === body.user.id)!;
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(user.passwordHash).not.toContain(TEST_PASSWORD);
    expect(user.activeProfileId).toBe(body.profile.id);
    const token = cookieFrom(res).split("=")[1];
    expect(db.sessions).toHaveLength(1);
    expect(db.sessions[0].tokenHash).not.toBe(token);
    expect(db.sessions[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const meRes = await me(req("/api/auth/me", { cookie: cookieFrom(res) }));
    expect(meRes.status).toBe(200);
    expect(await meRes.json()).toMatchObject({ user: { email: "antia@example.com" }, profile: { id: body.profile.id }, appUserId: body.appUserId });
  });

  it("two accounts get different profiles and different RevenueCat ids", async () => {
    const a = await (await signup(signupReq({ email: "a@example.com", password: TEST_PASSWORD }))).json();
    const b = await (await signup(signupReq({ email: "b@example.com", password: TEST_PASSWORD }))).json();
    expect(a.profile.id).not.toBe(b.profile.id);
    expect(a.appUserId).not.toBe(b.appUserId);
  });

  it("an email already in use (any case) is a 409 with a Spanish message", async () => {
    await signup(signupReq({ email: "dup@example.com", password: TEST_PASSWORD }));
    const res = await signup(signupReq({ email: "DUP@example.com", password: "otra-contraseña" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "conflict", message: expect.stringMatching(/Ya existe una cuenta/) });
    expect(readDb().users).toHaveLength(1);
  });

  it("validates the email format and an 8-character password", async () => {
    expect((await signup(signupReq({ email: "no-es-un-email", password: TEST_PASSWORD }))).status).toBe(400);
    const short = await signup(signupReq({ email: "ok@example.com", password: "corta" }));
    expect(short.status).toBe(400);
    expect((await short.json()).message).toMatch(/al menos 8 caracteres/);
  });

  it("sets Secure on the cookie in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const res = await signup(signupReq({ email: "prod@example.com", password: TEST_PASSWORD }));
      expect(res.headers.get("set-cookie")).toMatch(/Secure/i);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("invite code (MECENA_SIGNUP_CODE)", () => {
  it("open sign-up when unset; required and checked when set", async () => {
    expect(await (await config()).json()).toEqual({ signupCodeRequired: false });
    process.env.MECENA_SIGNUP_CODE = "rederas-2026";
    try {
      expect(await (await config()).json()).toEqual({ signupCodeRequired: true });
      const none = await signup(signupReq({ email: "x@example.com", password: TEST_PASSWORD }));
      expect(none.status).toBe(403);
      expect((await none.json()).message).toMatch(/código de invitación/);
      expect((await signup(signupReq({ email: "x@example.com", password: TEST_PASSWORD, code: "otro" }))).status).toBe(403);
      expect(readDb().users).toHaveLength(0);
      expect((await signup(signupReq({ email: "x@example.com", password: TEST_PASSWORD, code: " rederas-2026 " }))).status).toBe(201);
    } finally {
      delete process.env.MECENA_SIGNUP_CODE;
    }
  });
});

describe("POST /api/auth/login", () => {
  it("right password -> session; wrong password and unknown email -> the same generic 401", async () => {
    await signup(signupReq({ email: "luz@example.com", password: TEST_PASSWORD }));
    const ok = await login(loginReq({ email: "LUZ@example.com", password: TEST_PASSWORD }));
    expect(ok.status).toBe(200);
    expect((await me(req("/api/auth/me", { cookie: cookieFrom(ok) }))).status).toBe(200);

    const wrong = await login(loginReq({ email: "luz@example.com", password: "no-es-esta" }));
    const unknown = await login(loginReq({ email: "nadie@example.com", password: TEST_PASSWORD }));
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const [w, u] = [await wrong.json(), await unknown.json()];
    expect(w).toEqual(u);
    expect(w).toEqual({ error: "unauthorized", message: "Email o contraseña incorrectos." });
    expect(wrong.headers.get("set-cookie")).toBeNull();
  });

  it(`rate limit: after ${RATE_LIMIT.attempts} failed attempts per email (or per IP) -> 429`, async () => {
    await signup(signupReq({ email: "rl@example.com", password: TEST_PASSWORD }));
    for (let i = 0; i < RATE_LIMIT.attempts; i++) expect((await login(loginReq({ email: "rl@example.com", password: `mal-${i}-xxxx` }))).status).toBe(401);
    const blocked = await login(loginReq({ email: "rl@example.com", password: TEST_PASSWORD }));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe("too_many_requests");
    // per IP: another email from the same client is blocked too; another client is not
    const ip = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < RATE_LIMIT.attempts; i++) await login(loginReq({ email: `otro${i}@example.com`, password: "mal-xxxxxx" }, ip));
    expect((await login(loginReq({ email: "nuevo@example.com", password: "mal-xxxxxx" }, ip))).status).toBe(429);
    expect((await login(loginReq({ email: "nuevo@example.com", password: "mal-xxxxxx" }, { "x-forwarded-for": "198.51.100.1" }))).status).toBe(401);
  });
});

describe("sessions", () => {
  it("GET /api/auth/me without a cookie, with a made-up one or with an expired one -> 401", async () => {
    expect((await me(req("/api/auth/me", { cookie: null }))).status).toBe(401);
    expect(await (await me(req("/api/auth/me", { cookie: "mecena_session=inventado" }))).json()).toMatchObject({ error: "unauthorized" });
    const res = await signup(signupReq({ email: "exp@example.com", password: TEST_PASSWORD }));
    await updateDb((db) => {
      db.sessions[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    });
    expect((await me(req("/api/auth/me", { cookie: cookieFrom(res) }))).status).toBe(401);
  });

  it("logout deletes the session row and clears the cookie", async () => {
    const res = await signup(signupReq({ email: "bye@example.com", password: TEST_PASSWORD }));
    const cookie = cookieFrom(res);
    const second = cookieFrom(await login(loginReq({ email: "bye@example.com", password: TEST_PASSWORD })));
    expect(readDb().sessions).toHaveLength(2);
    const out = await logout(req("/api/auth/logout", { body: {}, cookie }));
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/mecena_session=;.*Max-Age=0/i);
    expect(readDb().sessions).toHaveLength(1);
    expect((await me(req("/api/auth/me", { cookie }))).status).toBe(401);
    expect((await me(req("/api/auth/me", { cookie: second }))).status).toBe(200); // other devices stay signed in
    expect((await logout(req("/api/auth/logout", { body: {}, cookie }))).status).toBe(200); // twice is fine
  });
});
