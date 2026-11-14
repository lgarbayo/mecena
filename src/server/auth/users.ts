/**
 * Accounts, sessions and the profiles each account owns. Server-only.
 * Identity always comes from here (session cookie -> User); clients never choose whose data they see.
 */
import { randomUUID } from "node:crypto";
import { ConflictError, NotFoundError, type Profile, type ProfileKind, type User } from "@/contracts";
import { blankBusiness, blankCreator } from "@/fixtures";
import { nowIso, readDb, updateDb, withCanonicalFields } from "@/server/store";
import { redeemInvite, type Redemption } from "./invites";
import { hashToken, newSessionToken, SESSION_MAX_AGE_S } from "./cookie";
import { dummyHash, hashPassword, verifyPassword } from "./password";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** A fresh RevenueCat app user id: one customer per account (and per demo reset). */
export const newAppUserId = () => `mecena-${randomUUID()}`;

/** A blank profile of this kind owned by the account (never one of the shared fixture profiles). */
export function blankProfileFor(ownerId: string, kind: ProfileKind): Profile {
  const template = kind === "business" ? blankBusiness : blankCreator;
  return withCanonicalFields({ ...structuredClone(template), id: `profile-${randomUUID()}`, ownerId, kind, updatedAt: nowIso() });
}

export function getUser(id: string): User | undefined {
  return readDb().users.find((u) => u.id === id);
}

export function findUserByEmail(email: string): User | undefined {
  const e = normalizeEmail(email);
  return readDb().users.find((u) => u.email === e);
}

/**
 * Creates the account and its first blank profile, of the kind chosen on the first screen (creator by default). 409 when the email is taken (the invite is then not
 * consumed). With an invite, its use is consumed in the same write; its cohort is kept on the account and its gift
 * of premium credits becomes the account's first entitlement.
 */
export async function createUser(input: { email: string; password: string; invite?: Redemption; kind?: ProfileKind }): Promise<User> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  return updateDb((db) => {
    if (db.users.some((u) => u.email === email)) throw new ConflictError("Ya existe una cuenta con ese email. Entra con tu contraseña.");
    const { cohort, credits } = redeemInvite(db, input.invite);
    const id = `user-${randomUUID()}`;
    const profile = blankProfileFor(id, input.kind ?? "creator");
    const user: User = { id, email, passwordHash, createdAt: nowIso(), activeProfileId: profile.id, appUserId: newAppUserId(), ...(cohort ? { signupCohort: cohort } : {}) };
    if (credits > 0) db.entitlements.push({ appUserId: user.appUserId, pro: false, premiumCredits: credits, premiumUsed: 0, grantedCredits: credits, source: "mock", updatedAt: nowIso() });
    db.profiles.push(profile);
    db.users.push(user);
    return user;
  });
}

/** The user for these credentials, or undefined. Same work whether or not the email exists. */
export async function authenticate(email: string, password: string): Promise<User | undefined> {
  const user = findUserByEmail(email);
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  return user && ok ? user : undefined;
}

// ---------- sessions ----------
/** New session for the user; returns the raw token for the cookie (only its hash is stored). Prunes expired ones. */
export async function createSession(userId: string, now = new Date()): Promise<string> {
  const token = newSessionToken();
  await updateDb((db) => {
    db.sessions = db.sessions.filter((s) => Date.parse(s.expiresAt) > now.getTime());
    db.sessions.push({
      tokenHash: hashToken(token),
      userId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_S * 1000).toISOString(),
    });
  });
  return token;
}

/** The user behind a session token, or undefined (unknown, expired, or the user is gone). */
export function userForToken(token: string | undefined, now = Date.now()): User | undefined {
  if (!token) return undefined;
  const db = readDb();
  const h = hashToken(token);
  const s = db.sessions.find((x) => x.tokenHash === h);
  if (!s || Date.parse(s.expiresAt) <= now) return undefined;
  return db.users.find((u) => u.id === s.userId);
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const h = hashToken(token);
  await updateDb((db) => {
    db.sessions = db.sessions.filter((s) => s.tokenHash !== h);
  });
}

// ---------- the user's profiles ----------
/**
 * The profile with this id, only if the user owns it. Anything else (unknown id, another user's profile, a legacy
 * profile without owner) is the same 404, so ids of other accounts cannot be probed.
 */
export function ownedProfile(userId: string, profileId: string): Profile {
  const p = readDb().profiles.find((x) => x.id === profileId);
  if (!p || p.ownerId !== userId) throw new NotFoundError("profile");
  return p;
}

/** The user's active profile; if it went missing, their first profile; if they have none, a new blank creator one. */
export async function activeProfile(user: User): Promise<Profile> {
  const db = readDb();
  const mine = db.profiles.filter((p) => p.ownerId === user.id);
  const active = mine.find((p) => p.id === user.activeProfileId);
  if (active) return active;
  return updateDb((d) => {
    const u = d.users.find((x) => x.id === user.id);
    if (!u) throw new NotFoundError("user");
    const p = d.profiles.find((x) => x.ownerId === user.id) ?? blankProfileFor(user.id, "creator");
    if (!d.profiles.some((x) => x.id === p.id)) d.profiles.push(p);
    u.activeProfileId = p.id;
    return p;
  });
}

/** Mode switch: make the user's profile of this kind active, creating a blank one the first time. */
export function switchMode(userId: string, kind: ProfileKind): Promise<Profile> {
  return updateDb((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new NotFoundError("user");
    const mine = db.profiles.filter((p) => p.ownerId === userId && p.kind === kind);
    let p = mine.find((x) => x.id === user.activeProfileId) ?? mine[0];
    if (!p) {
      p = blankProfileFor(userId, kind);
      db.profiles.push(p);
    }
    user.activeProfileId = p.id;
    return p;
  });
}
