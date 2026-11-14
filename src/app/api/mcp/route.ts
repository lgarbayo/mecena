// Owned by WP-04. Remote MCP server (Streamable HTTP, stateless, JSON responses) for Claude Desktop / Claude Code.
// Auth: `Authorization: Bearer <personal token>` from /cuenta (no session cookie; src/proxy.ts lets it through).
// The tools run as the token's user, on this app's data. See src/mcp/http.ts and docs/mcp.md.
import { handleMcpRequest } from "@/mcp/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (req: Request) => handleMcpRequest(req);
export const GET = (req: Request) => handleMcpRequest(req);
export const DELETE = (req: Request) => handleMcpRequest(req);
