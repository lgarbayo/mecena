import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TOOL_NAMES } from "@/contracts";
import { createMcpServer } from "@/mcp/server";
import { DEMO_EMAIL, loginDemo } from "../helpers";

describe("MCP server (scaffold)", () => {
  it("exposes the 8 shared tools and runs one", async () => {
    await loginDemo();
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer({ userEmail: DEMO_EMAIL });
    const client = new Client({ name: "test", version: "0.0.0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    const res = await client.callTool({ name: "get_profile", arguments: {} });
    expect(res.isError).toBeFalsy();
    await client.close();
  });
});
