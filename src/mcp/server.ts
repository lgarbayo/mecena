/**
 * Mecena MCP server (stdio). Baseline from the scaffold; owned by WP-04.
 * Run: npm run mcp   (Claude Desktop: see README / docs/mcp.md)
 * IMPORTANT: stdout is the MCP channel. Log to stderr only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toolSchemas, TOOL_NAMES } from "@/contracts";
import { runTool } from "@/tools/registry";

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "mecena", version: "0.1.0" });
  for (const name of TOOL_NAMES) {
    const def = toolSchemas[name];
    server.registerTool(name, { description: def.description, inputSchema: def.input.shape }, async (args: unknown) => {
      try {
        const out = await runTool(name, args, { caller: "mcp" });
        return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
      }
    });
  }
  return server;
}

async function main() {
  // Claude Desktop starts us with an arbitrary cwd: run from the repo root so data/ and .env resolve like the web app.
  process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f); // first wins (no overwrite)
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
  console.error("[mecena-mcp] ready on stdio");
}

if (process.argv[1] && /mcp[\\/]server\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
