// Owned by WP-04. The signed-in user's personal tokens for the remote MCP endpoint ("Conectar con Claude", /cuenta).
// GET -> McpTokensResponse; POST { label? } -> McpTokenCreated (the raw token is returned only here, once).
import { API, serverEnv } from "@/contracts";
import { McpTokenCreateRequest, type McpTokenCreated, type McpTokensResponse } from "@/contracts/api";
import { createMcpToken, listMcpTokens, publicMcpToken, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { idempotent } from "@/server/idempotency";

export const dynamic = "force-dynamic";

const endpoint = () => `${serverEnv().publicUrl}${API.mcp}`;

export const GET = route(async (req: Request) => {
  const user = requireUser(req);
  return json<McpTokensResponse>({ tokens: listMcpTokens(user.id).map(publicMcpToken), endpoint: endpoint() });
});

export const POST = route(
  idempotent(async (req: Request) => {
    const user = requireUser(req);
    const { label } = await body(req, McpTokenCreateRequest);
    const { token, record } = await createMcpToken(user.id, label);
    return json<McpTokenCreated>({ token, info: publicMcpToken(record), endpoint: endpoint() }, { status: 201, headers: { "cache-control": "no-store" } });
  }),
);
