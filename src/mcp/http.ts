/**
 * Remote MCP endpoint (POST /api/mcp): the same Mecena MCP server over Streamable HTTP, on the deployed app's data.
 * Claude Desktop (via mcp-remote) and Claude Code connect with a URL plus `Authorization: Bearer <personal token>`
 * (created and revoked at /cuenta, only its hash is stored). Setup: docs/mcp.md.
 *
 * Stateless: every POST gets a fresh server + transport (no session ids, nothing kept in memory between requests),
 * which suits a route handler and a single Fly machine. Responses are plain JSON (enableJsonResponse), no SSE.
 * The tools run as the token's user, re-read on every call (mode switch, purchases and demo resets are seen at once).
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { UnauthorizedError, type ToolContext, type ToolName, type User } from "@/contracts";
import { bearerToken, getUser, toolContextFor, userForMcpToken } from "@/server/auth";
import { clientIp, consumeAttempt } from "@/server/auth/rate-limit";
import { createMcpServer } from "./core";

/** Tool calls per user: a long Claude conversation fits, a runaway loop (or a leaked token) does not. */
export const MCP_TOOL_LIMIT = {
  attempts: 60,
  windowMs: 15 * 60_000,
  message: "Has hecho muchas peticiones a Mecena en poco tiempo. Espera unos minutos y vuelve a probar.",
};
/** Requests with a missing or wrong token, per client IP. */
export const MCP_BAD_TOKEN_LIMIT = { attempts: 30, windowMs: 15 * 60_000, message: "Demasiados intentos con un token no válido. Espera unos minutos." };
/** JSON-RPC bodies are small (a tool call with its arguments). */
export const MCP_MAX_BODY_BYTES = 256 * 1024;

type RunFn = (name: ToolName, input: unknown, ctx: ToolContext) => Promise<unknown>;

function rpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: status === 401 ? -32001 : -32000, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

const NO_TOKEN = "Falta tu token de Mecena: envía la cabecera «Authorization: Bearer <token>». Créalo en la web, en Cuenta → Conectar con Claude.";
const BAD_TOKEN = "Token de Mecena no válido o revocado. Crea uno nuevo en la web, en Cuenta → Conectar con Claude.";

/** The tool context of the token's user, read fresh for each tool call, after counting the call against the limit. */
function contextFor(user: User): () => Promise<ToolContext> {
  return async () => {
    consumeAttempt([`mcp:user:${user.id}`], Date.now(), MCP_TOOL_LIMIT);
    const fresh = getUser(user.id);
    if (!fresh) throw new UnauthorizedError(BAD_TOKEN);
    return toolContextFor(fresh, "mcp-remote");
  };
}

/** Handles one HTTP request to /api/mcp. `run` lets tests fake the tools. */
export async function handleMcpRequest(req: Request, opts: { run?: RunFn } = {}): Promise<Response> {
  const token = bearerToken(req);
  const user = userForMcpToken(token);
  if (!user) {
    try {
      consumeAttempt([`mcp:badtoken:ip:${clientIp(req)}`], Date.now(), MCP_BAD_TOKEN_LIMIT);
    } catch (e) {
      return rpcError(429, e instanceof Error ? e.message : MCP_BAD_TOKEN_LIMIT.message);
    }
    return rpcError(401, token ? BAD_TOKEN : NO_TOKEN, { "www-authenticate": 'Bearer realm="Mecena"' });
  }
  // Stateless server: no standalone SSE stream (GET) and no session to delete (DELETE).
  if (req.method !== "POST") return rpcError(405, "Este servidor MCP no guarda sesiones: usa POST.", { allow: "POST" });

  const server = createMcpServer({ run: opts.run, context: contextFor(user) });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: MCP_MAX_BODY_BYTES });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (e) {
    console.error("[mecena-mcp-http]", e);
    return rpcError(500, "Error interno del servidor MCP de Mecena.");
  } finally {
    await server.close().catch(() => undefined);
  }
}
