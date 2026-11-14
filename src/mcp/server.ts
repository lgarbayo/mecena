/**
 * Mecena MCP server for Claude Desktop / Claude Code. Owned by WP-04. Two transports, one server definition:
 * - remote: POST /api/mcp on the deployed app (Streamable HTTP, personal token; see ./http.ts). Uses the app's data.
 * - local stdio (this file's main): `MECENA_USER_EMAIL=you@example.com npm run mcp`. Acts as ONE account of the
 *   local data dir (MECENA_USER_EMAIL): that user's active profile and RevenueCat app user id.
 * Setup: docs/mcp.md. IMPORTANT (stdio): stdout is the MCP channel. Log to stderr only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { serverEnv } from "@/contracts";
import { findUserByEmail } from "@/server/auth";
import { createMcpServer } from "./core";

export { MCP_INSTRUCTIONS, callToolForMcp, createMcpServer, mcpToolContext, type McpServerOptions } from "./core";

// No background BDNS searches from this process: the app server owns the shared catalogue's writes (its file locks
// are in-process). A profile updated here is searched the next time the app loads its feed.
process.env.MECENA_CALLS_LIVE ??= "0";

/** Repo root, independent of the cwd Claude Desktop launches us with. */
export const repoRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** chdir to the repo root and load .env.local then .env (first wins, existing env never overwritten). */
export function prepareProcessEnv(root = repoRoot()) {
  process.chdir(root);
  for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);
}

async function main() {
  // Anything printed to stdout would corrupt the protocol: route stray console.log/info to stderr.
  console.log = console.error;
  console.info = console.error;
  prepareProcessEnv();
  const email = serverEnv().mcpUserEmail;
  if (!email) {
    console.error("[mecena-mcp] MECENA_USER_EMAIL is not set. Set it to the email of the Mecena account the MCP tools should act as (see docs/mcp.md).");
    process.exit(1);
  }
  if (!findUserByEmail(email)) {
    console.error(`[mecena-mcp] no Mecena account with email ${email} in ${serverEnv().dataDir}. Create it at /entrar first (see docs/mcp.md).`);
    process.exit(1);
  }
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
  console.error(`[mecena-mcp] ready on stdio as ${email} (cwd ${process.cwd()}, public URL ${process.env.MECENA_PUBLIC_URL || "http://localhost:3000"})`);
}

if (process.argv[1] && /mcp[\\/]server\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
