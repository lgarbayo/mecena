/** WP-04: the MCP front door, end to end over an in-memory transport, on AI mocks. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TOOL_NAMES, toolSchemas } from "@/contracts";
import { createMcpServer, type McpServerOptions } from "@/mcp/server";
import { DEMO_APP_USER_ID } from "@/fixtures";
import { createUser, DEMO_EMAIL, grantPro, loginDemo, seedOnboardedCreator } from "../helpers";

type TextBlock = { type: "text"; text: string };
const CALL_ID = "fixture-beca-artes-plasticas";

let client: Client | undefined;
beforeEach(async () => {
  await loginDemo(); // the MCP server acts as this account (MECENA_USER_EMAIL in real life)
});
afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect(opts?: McpServerOptions) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ userEmail: DEMO_EMAIL, ...opts });
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

async function call(c: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await c.callTool({ name, arguments: args });
  return { isError: Boolean(res.isError), blocks: res.content as TextBlock[] };
}

const json = (blocks: TextBlock[]) => JSON.parse(blocks[1].text);

describe("MCP server tools", () => {
  it("lists the 8 tools with descriptions and JSON input schemas, plus server instructions", async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const t of tools) {
      expect(t.description).toBe(toolSchemas[t.name as keyof typeof toolSchemas].description);
      expect(t.inputSchema.type).toBe("object");
    }
    const draft = tools.find((t) => t.name === "draft_application")!;
    expect(draft.inputSchema.required).toContain("callId");
    expect(c.getInstructions()).toMatch(/Mecena prepara/);
  });

  it("search_calls returns results for the fixture creator: Spanish summary + JSON, links on MECENA_PUBLIC_URL", async () => {
    await seedOnboardedCreator();
    const c = await connect();
    const { isError, blocks } = await call(c, "search_calls");
    expect(isError).toBe(false);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toMatch(/He encontrado \d+ convocatoria/);
    expect(blocks[0].text).toContain("http://localhost:3000/convocatorias/");
    const out = json(blocks);
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results.every((r: { call: { beneficiaryKinds: string[] } }) => r.call.beneficiaryKinds.includes("creator"))).toBe(true);
  });

  it("build_dossier with a fixture callId returns a call variant and a public link (Pro)", async () => {
    await seedOnboardedCreator();
    await grantPro();
    const c = await connect();
    const { isError, blocks } = await call(c, "build_dossier", { callId: CALL_ID });
    expect(isError).toBe(false);
    const out = json(blocks);
    expect(out.dossier.variant.callId).toBe(CALL_ID);
    expect(out.adapted).toBe(true);
    expect(out.url.startsWith("http://localhost:3000/dossier?")).toBe(true);
    expect(blocks[0].text).toContain("Adaptado a la convocatoria");
    expect(blocks[0].text).toContain(out.url);
  });

  it("links follow MECENA_PUBLIC_URL (e.g. the phone tunnel)", async () => {
    process.env.MECENA_PUBLIC_URL = "https://mecena-demo.example.dev/";
    try {
      await seedOnboardedCreator();
      const c = await connect();
      const { blocks } = await call(c, "export_dossier_pdf", { callId: CALL_ID });
      expect(json(blocks).url.startsWith("https://mecena-demo.example.dev/api/dossier/pdf?")).toBe(true);
      expect(blocks[0].text).toContain("https://mecena-demo.example.dev/api/dossier/pdf?");
    } finally {
      process.env.MECENA_PUBLIC_URL = "http://localhost:3000";
    }
  });

  it("draft_application without entitlement is an error with the pricing URL; with grantPro() it succeeds", async () => {
    await seedOnboardedCreator();
    const c = await connect();
    const denied = await call(c, "draft_application", { callId: CALL_ID });
    expect(denied.isError).toBe(true);
    expect(denied.blocks[0].text).toMatch(/^Necesitas Mecena Pro/);
    expect(denied.blocks[0].text).toContain("http://localhost:3000/pro");

    await grantPro(DEMO_APP_USER_ID); // a purchase on the phone is stored for the account's appUserId and unlocks MCP
    const ok = await call(c, "draft_application", { callId: CALL_ID });
    expect(ok.isError).toBe(false);
    const out = json(ok.blocks);
    expect(out.application.callId).toBe(CALL_ID);
    expect(out.url).toBe(`http://localhost:3000/solicitud/${CALL_ID}`);
    expect(ok.blocks[0].text).toMatch(/Borrador de solicitud listo/);
  });

  it("score_application returns a total between 0 and 100", async () => {
    await seedOnboardedCreator();
    await grantPro();
    const c = await connect();
    const drafted = json((await call(c, "draft_application", { callId: CALL_ID })).blocks);
    const { isError, blocks } = await call(c, "score_application", { applicationId: drafted.application.id });
    expect(isError).toBe(false);
    const { score, url } = json(blocks);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
    expect(url).toBe(`http://localhost:3000/tribunal/${drafted.application.id}`);
    expect(blocks[0].text).toContain(`${score.total}/100`);
  });

  it("every tool runs over MCP on the seeded demo", async () => {
    await seedOnboardedCreator();
    await grantPro();
    const c = await connect();
    const args: Record<string, Record<string, unknown>> = {
      get_profile: {},
      update_profile: { patch: { city: "Lugo" } },
      build_dossier: {},
      export_dossier_pdf: {},
      search_calls: { query: "beca", limit: 2 },
      explain_call: { callId: CALL_ID },
      draft_application: { callId: CALL_ID },
    };
    for (const [name, a] of Object.entries(args)) {
      const r = await call(c, name, a);
      expect(r.isError, `${name}: ${r.blocks[0]?.text}`).toBe(false);
      expect(r.blocks[0].text.length).toBeGreaterThan(0);
    }
    expect(json((await call(c, "get_profile")).blocks).profile.city).toBe("Lugo");
  });

  it("unknown ids come back as a Spanish isError message, not a crash", async () => {
    const c = await connect();
    const r = await call(c, "explain_call", { callId: "no-existe" });
    expect(r.isError).toBe(true);
    expect(r.blocks[0].text).toMatch(/no encontr/i);
  });

  it("uses the injected runner (handlers implemented in parallel WPs can be faked)", async () => {
    const seen: string[] = [];
    const c = await connect({
      run: async (name, input, ctx) => {
        seen.push(`${name}:${ctx.caller}:${JSON.stringify(input)}`);
        return { score: { total: 84, criteria: [], disclaimer: "Orientativo." }, url: "http://localhost:3000/tribunal/x" };
      },
    });
    const r = await call(c, "score_application", { applicationId: "x" });
    expect(r.blocks[0].text).toContain("84/100");
    expect(seen).toEqual(['score_application:mcp:{"applicationId":"x"}']);
  });

  it("only ever sees its own account: another user's profile id is 'not found'", async () => {
    const other = await createUser("otra@mecena.test");
    const c = await connect();
    const r = await call(c, "get_profile", { profileId: other.user.activeProfileId });
    expect(r.isError).toBe(true);
    expect(r.blocks[0].text).toMatch(/no encontr/i);
    const mine = await call(c, "get_profile");
    expect(json(mine.blocks).profile.id).toBe("demo-creator");
  });

  it("without a configured account every tool call is an error that explains MECENA_USER_EMAIL", async () => {
    const c = await connect({ userEmail: "" });
    const r = await call(c, "get_profile");
    expect(r.isError).toBe(true);
    expect(r.blocks[0].text).toContain("MECENA_USER_EMAIL");
    const unknown = await connect({ userEmail: "nadie@mecena.test" });
    expect((await call(unknown, "get_profile")).blocks[0].text).toMatch(/No hay ninguna cuenta/);
  });
});
