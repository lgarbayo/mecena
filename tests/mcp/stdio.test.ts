/**
 * WP-04: the real stdio server, spawned exactly like Claude Desktop does (docs/claude_desktop_config.example.json):
 * from an unrelated cwd, through `npx --prefix <repo> tsx --tsconfig <repo>/tsconfig.json <repo>/src/mcp/server.ts`.
 * Proves it chdirs to the repo, keeps stdout clean for JSON-RPC and logs to stderr.
 */
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TOOL_NAMES } from "@/contracts";
import { DEMO_EMAIL, loginDemo } from "../helpers";

const repo = path.resolve(__dirname, "../..");

describe("MCP stdio server", () => {
  it("starts from any cwd, lists the tools and answers a call; logs go to stderr", { timeout: 60_000 }, async () => {
    await loginDemo(); // the account in this test's data dir that MECENA_USER_EMAIL points at
    const transport = new StdioClientTransport({
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      args: ["--prefix", repo, "tsx", "--tsconfig", path.join(repo, "tsconfig.json"), path.join(repo, "src/mcp/server.ts")],
      cwd: os.tmpdir(),
      env: { ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string")), MECENA_USER_EMAIL: DEMO_EMAIL },
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
      expect(stderr).toContain(`[mecena-mcp] ready on stdio as ${DEMO_EMAIL}`);
      expect(stderr).toContain(`cwd ${repo}`);
    } finally {
      await client.close();
    }
  });

  it("refuses to start without MECENA_USER_EMAIL, with a clear message on stderr", { timeout: 60_000 }, async () => {
    // Empty (not absent) so a MECENA_USER_EMAIL in the developer's .env cannot fill it in (.env never overwrites).
    const env = { ...process.env, MECENA_USER_EMAIL: "" };
    const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--prefix", repo, "tsx", "--tsconfig", path.join(repo, "tsconfig.json"), path.join(repo, "src/mcp/server.ts")], {
      cwd: os.tmpdir(),
      env,
      encoding: "utf8" as const,
      input: "",
      timeout: 50_000,
    }) as { status: number | null; stdout: string; stderr: string };
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("MECENA_USER_EMAIL is not set");
  });
});
