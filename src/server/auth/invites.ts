/**
 * Sign-up invite codes. Server-only.
 * Every AI call spends the owner's key, so sign-up is invite-only when there is any code (MECENA_SIGNUP_CODE or one in
 * the db, created with `npm run invite`). A db code can cap its uses, expire, tag its accounts with a cohort label and
 * gift premium credits; the env code is the plain "default" one (no cap, no gift).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { ConflictError, ForbiddenError, serverEnv, type Db, type InviteCode } from "@/contracts";
import { nowIso, readDb, updateDb } from "@/server/store";

export const normalizeInviteCode = (code: string) => code.trim().toUpperCase();
const CODE_SHAPE = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

/** Cohort stored on accounts created with the env code. */
export const DEFAULT_COHORT = "default";

const digest = (s: string) => createHash("sha256").update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export type InviteStatus = "ok" | "expired" | "exhausted";
export function inviteStatus(inv: InviteCode, now = Date.now()): InviteStatus {
  if (inv.expiresAt && Date.parse(inv.expiresAt) <= now) return "expired";
  if (inv.maxUses !== undefined && inv.uses >= inv.maxUses) return "exhausted";
  return "ok";
}

const refusal = (status: Exclude<InviteStatus, "ok"> | "unknown") =>
  new ForbiddenError(
    status === "expired" ? "Este código de invitación ha caducado." : status === "exhausted" ? "Este código de invitación ya no tiene plazas." : "El código de invitación no es correcto.",
  );

/** Whether sign-up needs a code at all: the env code is set, or any code exists in the db (an expired one still closes it). */
export function signupCodeRequired(db: Db = readDb()): boolean {
  return Boolean(serverEnv().signupCode) || db.inviteCodes.length > 0;
}

/** What a sign-up presented: a db invite (to be consumed inside createUser), the env code, or nothing (open sign-up). */
export type Redemption = { kind: "invite"; code: string } | { kind: "env" };

/** Checks the code a visitor typed. Throws 403 (wrong, expired, no places left); undefined = sign-up is open. */
export function checkSignupCode(given: string | undefined, db: Db = readDb()): Redemption | undefined {
  const typed = normalizeInviteCode(given ?? "");
  let match: InviteCode | undefined;
  for (const inv of db.inviteCodes) if (same(typed, inv.code) && typed) match ||= inv; // no early exit: same work for every code
  if (match) {
    const status = inviteStatus(match);
    if (status !== "ok") throw refusal(status);
    return { kind: "invite", code: match.code };
  }
  const expected = serverEnv().signupCode;
  if (expected) {
    if (given && same(given, expected)) return { kind: "env" };
    throw refusal("unknown");
  }
  if (db.inviteCodes.length > 0) throw refusal("unknown");
  return undefined;
}

/**
 * Consumes the invite INSIDE the caller's updateDb (so the use and the account are one atomic write, and the last place
 * cannot be taken twice). Returns the cohort and the credits to gift. Throws 403 when it stopped being valid meanwhile.
 */
export function redeemInvite(db: Db, r: Redemption | undefined): { cohort?: string; credits: number } {
  if (!r) return { credits: 0 };
  if (r.kind === "env") return { cohort: DEFAULT_COHORT, credits: 0 };
  const inv = db.inviteCodes.find((i) => i.code === r.code);
  if (!inv) throw refusal("unknown");
  const status = inviteStatus(inv);
  if (status !== "ok") throw refusal(status);
  inv.uses += 1;
  return { cohort: inv.label, credits: inv.grantCredits };
}

// ---------- admin (scripts/invite.ts) ----------
export interface NewInvite {
  code: string;
  label?: string;
  maxUses?: number;
  expiresAt?: string;
  grantCredits?: number;
}

export async function createInvite(input: NewInvite): Promise<InviteCode> {
  const code = normalizeInviteCode(input.code);
  if (!CODE_SHAPE.test(code)) throw new Error("El código tiene que tener de 3 a 40 caracteres: letras, números, «-» o «_».");
  const grantCredits = input.grantCredits ?? 0;
  if (!Number.isInteger(grantCredits) || grantCredits < 0 || grantCredits > 20) throw new Error("Los créditos de regalo van de 0 a 20.");
  if (input.maxUses !== undefined && (!Number.isInteger(input.maxUses) || input.maxUses < 1)) throw new Error("El máximo de usos tiene que ser un entero de 1 en adelante.");
  if (input.expiresAt !== undefined && Number.isNaN(Date.parse(input.expiresAt))) throw new Error("La fecha de caducidad no es válida.");
  const label = input.label?.trim() || code.toLowerCase();
  return updateDb((db) => {
    if (db.inviteCodes.some((i) => i.code === code)) throw new ConflictError(`El código ${code} ya existe.`);
    const inv: InviteCode = {
      code,
      label,
      uses: 0,
      grantCredits,
      createdAt: nowIso(),
      ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: new Date(input.expiresAt).toISOString() } : {}),
    };
    db.inviteCodes.push(inv);
    return inv;
  });
}

/** Every code with its status and how many accounts of its cohort exist now. */
export function listInvites(now = Date.now()): { invite: InviteCode; status: InviteStatus; accounts: number }[] {
  const db = readDb();
  return db.inviteCodes.map((invite) => ({ invite, status: inviteStatus(invite, now), accounts: db.users.filter((u) => u.signupCohort === invite.label).length }));
}

/** Deletes the code (accounts already created keep their cohort and credits). False when it did not exist. */
export function deleteInvite(code: string): Promise<boolean> {
  const c = normalizeInviteCode(code);
  return updateDb((db) => {
    const before = db.inviteCodes.length;
    db.inviteCodes = db.inviteCodes.filter((i) => i.code !== c);
    return db.inviteCodes.length < before;
  });
}
