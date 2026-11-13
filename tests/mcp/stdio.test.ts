/**
 * WP-04: the real stdio server, spawned exactly like Claude Desktop does (docs/claude_desktop_config.example.json):
 * from an unrelated cwd, through `npx --prefix <repo> tsx --tsconfig <repo>/tsconfig.json <repo>/src/mcp/server.ts`.
 * Proves it chdirs to the repo, keeps stdout clean for JSON-RPC and logs to stderr.
 */
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TOOL_NAMES } from "@/contracts";

const repo = path.resolve(__dirname, "../..");

describe("MCP stdio server", () => {
  it("starts from any cwd, lists the tools and answers a call; logs go to stderr", { timeout: 60_000 }, async () => {
    const transport = new StdioClientTransport({
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["--prefix", repo, "tsx", "--tsconfig", path.join(repo, "tsconfig.json"), path.join(repo, "src/mcp/server.ts")],
      cwd: os.tmpdir(),
      env: Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string")),
      stderr: "pipe",
    });
    let stderr = "";
    (transport.stderr as PassThrough | null)?.on("data", (d: Buffer) => (stderr += d.toString()));
    const client = new Client({ name: "stdio-test", version: "0.0.0" });
    try {
      await client.connect(transport); // any non-JSON line on stdout would break the handshake
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
      const res = await client.callTool({ name: "get_profile", arguments: {} });
      expect(res.isError).toBeFalsy();
      expect(stderr).toContain("[mecena-mcp] ready on stdio");
      expect(stderr).toContain(`cwd ${repo}`);
    } finally {
      await client.close();
    }
  });
});
