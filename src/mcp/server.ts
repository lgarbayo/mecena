/**
 * Mecena MCP server (stdio) for Claude Desktop / Claude Code. Owned by WP-04.
 * Run: npm run mcp   (setup: docs/mcp.md)
 * IMPORTANT: stdout is the MCP channel. Log to stderr only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toolSchemas, TOOL_NAMES, type ToolContext, type ToolName } from "@/contracts";
import { runTool } from "@/tools/registry";
import { summarizeToolResult, toolErrorMessage } from "@/tools/present";

export const MCP_INSTRUCTIONS = [
  "Mecena ayuda a artistas, ilustradores, fotógrafos, pymes y autónomos con el papeleo de convocatorias, becas, premios y subvenciones.",
  "Mecena prepara; la persona usuaria revisa y presenta. Nunca inventes datos del perfil que no haya dicho.",
  "Flujo típico: search_calls → explain_call → build_dossier (con callId) → export_dossier_pdf → draft_application → score_application.",
  "Cada herramienta devuelve un resumen en español y después el JSON completo. Comparte siempre los enlaces (url) con la persona usuaria.",
].join(" ");

type RunFn = (name: ToolName, input: unknown, ctx: ToolContext) => Promise<unknown>;

export interface McpServerOptions {
  /** Tool runner; tests can inject a fake. Defaults to the shared registry. */
  run?: RunFn;
}

/** Text content blocks returned for a tool call: [human summary, JSON]. */
export async function callToolForMcp(name: ToolName, args: unknown, run: RunFn = runTool) {
  try {
    const out = await run(name, args, { caller: "mcp" }); // no appUserId: entitlement comes from the store (meta.appUserId)
    return {
      content: [
        { type: "text" as const, text: summarizeToolResult(name, out as never) },
        { type: "text" as const, text: JSON.stringify(out, null, 2) },
      ],
    };
  } catch (e) {
    console.error(`[mecena-mcp] ${name} failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    return { isError: true, content: [{ type: "text" as const, text: toolErrorMessage(e) }] };
  }
}

export function createMcpServer(opts: McpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "mecena", version: "0.1.0" }, { instructions: MCP_INSTRUCTIONS });
  for (const name of TOOL_NAMES) {
    const def = toolSchemas[name];
    server.registerTool(name, { description: def.description, inputSchema: def.input.shape }, async (args: unknown) => callToolForMcp(name, args, opts.run));
  }
  return server;
}

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
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
  console.error(`[mecena-mcp] ready on stdio (cwd ${process.cwd()}, public URL ${process.env.MECENA_PUBLIC_URL || "http://localhost:3000"})`);
}

if (process.argv[1] && /mcp[\\/]server\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
