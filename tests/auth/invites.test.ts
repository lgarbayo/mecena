/** Invite codes: cap, expiry, cohort, gifted premium credits, and that the gift survives RevenueCat syncs. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { GET as config } from "@/app/api/auth/config/route";
import { PaymentRequiredError } from "@/contracts";
import { resetAllDemo } from "@/features/demo/service";
import { reserveDraftCredit, resetPurchaseSyncState, resolveEntitlement, syncEntitlement, verificationMode, type Subscriber } from "@/features/purchases/server";
import { createInvite, deleteInvite, listInvites } from "@/server/auth/invites";
import { getEntitlement, nowIso, readDb, saveEntitlement } from "@/server/store";
import { req, TEST_PASSWORD } from "../helpers";

const signupWith = (email: string, code?: string) => signup(req("/api/auth/signup", { body: { email, password: TEST_PASSWORD, ...(code !== undefined ? { code } : {}) }, cookie: null }));
const emptyCustomer = (sub: Subscriber = {}): typeof fetch => (async () => Response.json({ subscriber: sub })) as typeof fetch;
const day = 864e5;

afterEach(() => {
  delete process.env.MECENA_SIGNUP_CODE;
  resetPurchaseSyncState();
  vi.unstubAllEnvs();
});

describe("redeeming a code", () => {
  it("is required as soon as a code exists; typed case-insensitively; tags the cohort and counts the use", async () => {
    expect(await (await config()).json()).toEqual({ signupCodeRequired: false, signupCodeAccepted: false });
    await createInvite({ code: "1hack", label: "1hack-2026", maxUses: 3 });
    expect(await (await config()).json()).toEqual({ signupCodeRequired: true, signupCodeAccepted: true });

    expect((await signupWith("a@mecena.test")).status).toBe(403);
    expect((await signupWith("a@mecena.test", "otro")).status).toBe(403);
    expect(readDb().users).toHaveLength(0);

    const ok = await signupWith("a@mecena.test", " 1HaCk ");
    expect(ok.status).toBe(201);
    const db = readDb();
    expect(db.users[0]).toMatchObject({ email: "a@mecena.test", signupCohort: "1hack-2026" });
    expect(db.inviteCodes[0]).toMatchObject({ code: "1HACK", uses: 1 });
    expect(listInvites()[0]).toMatchObject({ status: "ok", accounts: 1 });
  });

  it("stops at the cap: the last place cannot be taken twice, even by simultaneous sign-ups", async () => {
    await createInvite({ code: "DOS", maxUses: 2 });
    const res = await Promise.all(["a", "b", "c", "d"].map((n) => signupWith(`${n}@mecena.test`, "DOS")));
    expect(res.map((r) => r.status).sort()).toEqual([201, 201, 403, 403]);
    expect(readDb().users).toHaveLength(2);
    expect(readDb().inviteCodes[0].uses).toBe(2);
    const late = await signupWith("e@mecena.test", "DOS");
    expect((await late.json()).message).toMatch(/plazas/);
    expect(listInvites()[0].status).toBe("exhausted");
  });

  it("an expired code is refused with its own message", async () => {
    await createInvite({ code: "AYER", expiresAt: new Date(Date.now() - day).toISOString() });
    const res = await signupWith("a@mecena.test", "AYER");
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/caducado/);
    expect(listInvites()[0].status).toBe("expired");
  });

  it("an email that is already taken does not use up a place", async () => {
    await createInvite({ code: "UNA", maxUses: 1 });
    expect((await signupWith("a@mecena.test", "UNA")).status).toBe(201);
    await createInvite({ code: "OTRA", maxUses: 1 });
    expect((await signupWith("a@mecena.test", "OTRA")).status).toBe(409);
    expect(readDb().inviteCodes.find((i) => i.code === "OTRA")!.uses).toBe(0);
  });

  it("MECENA_SIGNUP_CODE keeps working next to db codes, as the «default» cohort without gift", async () => {
    process.env.MECENA_SIGNUP_CODE = "rederas-2026";
    await createInvite({ code: "1HACK", grantCredits: 1 });
    expect((await signupWith("a@mecena.test", "rederas-2026")).status).toBe(201);
    expect(readDb().users[0].signupCohort).toBe("default");
    expect(readDb().entitlements).toHaveLength(0);
    expect((await signupWith("b@mecena.test", "1hack")).status).toBe(201);
    expect((await signupWith("c@mecena.test", "REDERAS-2026")).status).toBe(403); // the env code is exact, as before
  });

  it("a deleted code stops working but leaves its accounts alone", async () => {
    await createInvite({ code: "TEMP" });
    await signupWith("a@mecena.test", "TEMP");
    expect(await deleteInvite("temp")).toBe(true);
    expect(await deleteInvite("temp")).toBe(false);
    expect(readDb().users).toHaveLength(1);
    expect(await (await config()).json()).toEqual({ signupCodeRequired: false, signupCodeAccepted: false }); // no codes left: open again
  });

  it("MECENA_SIGNUP_OPEN=1: no code needed, but a typed code is still checked and still gifts", async () => {
    vi.stubEnv("MECENA_SIGNUP_OPEN", "1");
    await createInvite({ code: "1HACK", label: "1hack-2026", maxUses: 1, grantCredits: 1 });
    expect(await (await config()).json()).toEqual({ signupCodeRequired: false, signupCodeAccepted: true });

    expect((await signupWith("a@mecena.test")).status).toBe(201);
    expect((await signupWith("b@mecena.test", "  ")).status).toBe(201);
    expect(readDb().users.map((u) => u.signupCohort)).toEqual([undefined, undefined]);

    const typo = await signupWith("c@mecena.test", "1HAK");
    expect(typo.status).toBe(403);
    expect((await typo.json()).message).toMatch(/dejarlo vacío/);

    expect((await signupWith("c@mecena.test", "1hack")).status).toBe(201);
    const c = readDb().users.find((u) => u.email === "c@mecena.test")!;
    expect(c.signupCohort).toBe("1hack-2026");
    expect(getEntitlement(c.appUserId)).toMatchObject({ premiumCredits: 1, grantedCredits: 1 });
    expect(readDb().inviteCodes[0].uses).toBe(1);
    expect((await signupWith("d@mecena.test", "1hack")).status).toBe(403); // no places left: say so, do not drop the gift silently
  });

  it("codes survive a whole-database demo reset", async () => {
    await createInvite({ code: "KEEP", maxUses: 5 });
    await resetAllDemo();
    expect(readDb().inviteCodes.map((i) => i.code)).toEqual(["KEEP"]);
  });
});

describe("creating codes", () => {
  it("validates the shape, the numbers and duplicates", async () => {
    await expect(createInvite({ code: "a" })).rejects.toThrow(/3 a 40/);
    await expect(createInvite({ code: "con espacios" })).rejects.toThrow(/3 a 40/);
    await expect(createInvite({ code: "OK1", grantCredits: 21 })).rejects.toThrow(/0 a 20/);
    await expect(createInvite({ code: "OK1", maxUses: 0 })).rejects.toThrow(/máximo de usos/);
    await expect(createInvite({ code: "OK1", expiresAt: "mañana" })).rejects.toThrow(/caducidad/);
    await createInvite({ code: "ok1" });
    await expect(createInvite({ code: "OK1" })).rejects.toThrow(/ya existe/);
    expect(readDb().inviteCodes[0]).toMatchObject({ code: "OK1", label: "ok1", uses: 0, grantCredits: 0 });
  });
});

describe("the gifted credit", () => {
  const signedUp = async (code = "1HACK") => {
    await createInvite({ code, grantCredits: 1 });
    expect((await signupWith("luz@mecena.test", code)).status).toBe(201);
    return readDb().users[0];
  };

  it("is the new account's premium credit: unlocks one draft, once", async () => {
    const user = await signedUp();
    expect(getEntitlement(user.appUserId)).toMatchObject({ pro: false, premiumCredits: 1, grantedCredits: 1, premiumUsed: 0 });
    expect((await resolveEntitlement(user.appUserId)).premiumCredits).toBe(1);
    expect((await reserveDraftCredit(user.appUserId)).usedCredit).toBe(true);
    await expect(reserveDraftCredit(user.appUserId)).rejects.toBeInstanceOf(PaymentRequiredError);
    expect(getEntitlement(user.appUserId)).toMatchObject({ premiumCredits: 0, premiumUsed: 1, grantedCredits: 1 });
  });

  it("a failed draft gives it back", async () => {
    const user = await signedUp();
    const r = await reserveDraftCredit(user.appUserId);
    await r.refund();
    expect(getEntitlement(user.appUserId)).toMatchObject({ premiumCredits: 1, premiumUsed: 0 });
  });

  it("survives a RevenueCat sync (it is not a purchase there) and a bought credit adds to it", async () => {
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "sk_test_x");
    const user = await signedUp();
    expect((await syncEntitlement({ appUserId: user.appUserId }, emptyCustomer())).premiumCredits).toBe(1);
    expect((await syncEntitlement({ appUserId: user.appUserId }, emptyCustomer({ non_subscriptions: { mecena_solicitud_premium: [{ id: "t1", purchase_date: nowIso() }] } }))).premiumCredits).toBe(2);
    expect((await reserveDraftCredit(user.appUserId)).usedCredit).toBe(true);
    // spent stays spent after another sync
    expect((await syncEntitlement({ appUserId: user.appUserId }, emptyCustomer({ non_subscriptions: { mecena_solicitud_premium: [{ id: "t1", purchase_date: nowIso() }] } }))).premiumCredits).toBe(1);
    expect(getEntitlement(user.appUserId).grantedCredits).toBe(1);
  });

  it("counts without any RevenueCat check, but only what the server gifted (a forged claim is still worth nothing)", async () => {
    vi.stubEnv("NEXT_PUBLIC_PURCHASES_MOCK", "0"); // production-like: purchases cannot be verified
    expect(verificationMode()).toBe("disabled");
    const user = await signedUp();
    expect((await resolveEntitlement(user.appUserId)).premiumCredits).toBe(1);
    await saveEntitlement({ appUserId: "forger", pro: false, premiumCredits: 5, source: "mock", updatedAt: nowIso() });
    expect((await resolveEntitlement("forger")).premiumCredits).toBe(0);
    await saveEntitlement({ ...getEntitlement(user.appUserId), premiumCredits: 6 }); // gift 1 + a claimed 5
    expect((await resolveEntitlement(user.appUserId)).premiumCredits).toBe(1);
  });
});
