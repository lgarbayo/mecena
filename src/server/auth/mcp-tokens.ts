/**
 * Personal access tokens for the remote MCP endpoint (POST /api/mcp). Server-only.
 * Same model as sessions: the raw token ("mcn_" + 32 random bytes) is shown to its owner once; only its sha256 is
 * stored, so a leaked db.json does not leak working tokens. Each token belongs to one user and is revoked from /cuenta.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { NotFoundError, TooManyRequestsError, type McpToken, type User } from "@/contracts";
import { nowIso, readDb, updateDb } from "@/server/store";
import { hashToken } from "./cookie";

export const MCP_TOKEN_PREFIX = "mcn_";
/** Active tokens per account: enough for a laptop, a desktop and Claude Code, small enough to review. */
export const MAX_MCP_TOKENS = 10;
/** lastUsedAt is refreshed at most this often, so every MCP request does not rewrite db.json. */
const TOUCH_EVERY_MS = 5 * 60_000;

export const newMcpToken = () => `${MCP_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;

/** What the owner sees of a token (never its hash). */
export const publicMcpToken = (t: McpToken) => ({ id: t.id, label: t.label, prefix: t.prefix, createdAt: t.createdAt, ...(t.lastUsedAt ? { lastUsedAt: t.lastUsedAt } : {}) });

export function listMcpTokens(userId: string): McpToken[] {
  return readDb()
    .mcpTokens.filter((t) => t.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Creates a token for the user and returns the raw value (the only time it exists outside the client). */
export async function createMcpToken(userId: string, label?: string): Promise<{ token: string; record: McpToken }> {
  const token = newMcpToken();
  const record = await updateDb((db) => {
    if (!db.users.some((u) => u.id === userId)) throw new NotFoundError("Usuario");
    if (db.mcpTokens.filter((t) => t.userId === userId).length >= MAX_MCP_TOKENS)
      throw new TooManyRequestsError(`Ya tienes ${MAX_MCP_TOKENS} conexiones con Claude. Revoca alguna antes de crear otra.`);
    const rec: McpToken = {
      id: `mcptok-${randomUUID()}`,
      userId,
      tokenHash: hashToken(token),
      prefix: `${token.slice(0, MCP_TOKEN_PREFIX.length + 6)}…`,
      label: label?.trim() || "Claude",
      createdAt: nowIso(),
    };
    db.mcpTokens.push(rec);
    return rec;
  });
  return { token, record };
}

/** Revokes one of the user's tokens. Another user's (or an unknown) id is the same 404. */
export async function revokeMcpToken(userId: string, id: string): Promise<void> {
  await updateDb((db) => {
    const i = db.mcpTokens.findIndex((t) => t.id === id && t.userId === userId);
    if (i < 0) throw new NotFoundError("Conexión");
    db.mcpTokens.splice(i, 1);
  });
}

/** The user behind a raw MCP token, or undefined (unknown/revoked token, or the user is gone). */
export function userForMcpToken(token: string | undefined, now = Date.now()): User | undefined {
  if (!token || !token.startsWith(MCP_TOKEN_PREFIX)) return undefined;
  const db = readDb();
  const h = hashToken(token);
  const rec = db.mcpTokens.find((t) => t.tokenHash === h);
  if (!rec) return undefined;
  const user = db.users.find((u) => u.id === rec.userId);
  if (!user) return undefined;
  if (!rec.lastUsedAt || now - Date.parse(rec.lastUsedAt) > TOUCH_EVERY_MS) {
    void updateDb((d) => {
      const t = d.mcpTokens.find((x) => x.id === rec.id);
      if (t) t.lastUsedAt = new Date(now).toISOString();
    }).catch(() => undefined);
  }
  return user;
}

/** The raw token of an `Authorization: Bearer <token>` header, if any. */
export function bearerToken(req: Request): string | undefined {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  return m?.[1];
}
