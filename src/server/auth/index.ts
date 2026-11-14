/**
 * Server-side identity for route handlers (and the tools registry). Server-only.
 *
 * Rules every API route follows:
 * - requireUser(req) first: no valid session -> UnauthorizedError -> 401.
 * - A profileId from the query/body is used only if the user owns it (else 404, existence is not leaked);
 *   without one, the user's active profile.
 * - appUserId (RevenueCat) is always the user's own; anything the client sends is ignored.
 * - Resources by id (works, applications, scores) are reachable only through one of the user's profiles.
 */
import { NotFoundError, UnauthorizedError, type Application, type Invoice, type Profile, type ToolContext, type User, type Work } from "@/contracts";
import { readDb } from "@/server/store";
import { bindAiAccount } from "@/features/demo/ai-mode";
import { readSessionToken } from "./cookie";
import { activeProfile, ownedProfile, userForToken } from "./users";

export { SESSION_COOKIE, readSessionToken, setSessionCookie, clearSessionCookie } from "./cookie";
export * from "./users";
export { checkSignupCode, signupCodeAccepted, signupCodeRequired, type Redemption } from "./invites";
export { bearerToken, createMcpToken, listMcpTokens, publicMcpToken, revokeMcpToken, userForMcpToken, MAX_MCP_TOKENS } from "./mcp-tokens";

/** The signed-in user for this request, or undefined. Reads the cookie header, so it works with plain Requests. */
export function getSessionUser(req: Request): User | undefined {
  return userForToken(readSessionToken(req));
}

export function requireUser(req: Request): User {
  const user = getSessionUser(req);
  if (!user) throw new UnauthorizedError();
  bindAiAccount(user.id); // the AI layer honours this account's /demo switches for the rest of the request
  return user;
}

/** The profile a request is about: the given one if the user owns it, else their active profile. */
export async function resolveProfile(user: User, profileId?: string | null): Promise<Profile> {
  return profileId ? ownedProfile(user.id, profileId) : activeProfile(user);
}

/** requireUser + resolveProfile in one go (the common case for GET ?profileId routes). */
export async function requireProfile(req: Request, profileId?: string | null): Promise<{ user: User; profile: Profile }> {
  const user = requireUser(req);
  return { user, profile: await resolveProfile(user, profileId) };
}

function ownsProfileId(userId: string, profileId: string): boolean {
  return readDb().profiles.some((p) => p.id === profileId && p.ownerId === userId);
}

/** A work of one of the user's profiles (404 otherwise, same as an unknown id). */
export function ownedWork(userId: string, workId: string): Work {
  const w = readDb().works.find((x) => x.id === workId);
  if (!w || !ownsProfileId(userId, w.profileId)) throw new NotFoundError("work");
  return w;
}

/** An application of one of the user's profiles (404 otherwise). */
export function ownedApplication(userId: string, applicationId: string): Application {
  const a = readDb().applications.find((x) => x.id === applicationId);
  if (!a || !ownsProfileId(userId, a.profileId)) throw new NotFoundError("application");
  return a;
}

/** An invoice of one of the user's applications (404 otherwise). */
export function ownedInvoice(userId: string, invoiceId: string): Invoice {
  const i = readDb().invoices.find((x) => x.id === invoiceId);
  if (!i || !ownsProfileId(userId, i.profileId)) throw new NotFoundError("invoice");
  return i;
}

/** What the shared tools run as: this user, their active profile and their RevenueCat id. */
export async function toolContextFor(user: User, caller: ToolContext["caller"]): Promise<ToolContext> {
  const profile = await activeProfile(user);
  return { caller, userId: user.id, profileId: profile.id, appUserId: user.appUserId };
}

/** Public part of a user (never the password hash). */
export const publicUser = (u: User) => ({ id: u.id, email: u.email });
