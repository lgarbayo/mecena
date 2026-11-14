/**
 * Remote MCP (POST /api/mcp, Streamable HTTP) with personal tokens from /cuenta: the official SDK client talks to the
 * route handler directly (its fetch is the handler), so this is the same initialize → tools/list → tools/call flow
 * Claude Desktop (mcp-remote) and Claude Code run against mecena.fly.dev.
 */
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { TOOL_NAMES } from "@/contracts";
import { McpTokenCreated, McpTokensResponse } from "@/contracts/api";
import { DELETE as mcpDelete, GET as mcpGet, POST as mcpPost } from "@/app/api/mcp/route";
import { GET as listTokens, POST as createToken } from "@/app/api/mcp-tokens/route";
import { DELETE as revokeToken } from "@/app/api/mcp-tokens/[id]/route";
import { MCP_TOOL_LIMIT } from "@/mcp/http";
import { proxy } from "@/proxy";
import { readDb } from "@/server/store";
import { DEMO_APP_USER_ID } from "@/fixtures";
import { createUser, ctx, grantPro, loginDemo, req, seedOnboardedCreator } from "../helpers";

type TextBlock = { type: "text"; text: string };
const URL_MCP = "http://localhost:3000/api/mcp";
const CALL_ID = "fixture-beca-artes-plasticas";

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

/** A token for the signed-in user (cookie), through the real route. */
async function newToken(cookie?: string, label = "Claude Desktop"): Promise<McpTokenCreated> {
  const res = await createToken(req("/api/mcp-tokens", { body: { label }, ...(cookie ? { cookie } : {}) }));
  expect(res.status).toBe(201);
  return McpTokenCreated.parse(await res.json());
}

/** The SDK's Streamable HTTP client, with the route handler as its fetch. */
async function connect(token: string | undefined) {
  const transport = new StreamableHTTPClientTransport(new URL(URL_MCP), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    fetch: async (url, init) => {
      const r = new Request(url, init);
      return r.method === "POST" ? mcpPost(r) : r.method === "DELETE" ? mcpDelete(r) : mcpGet(r);
    },
  });
  const client = new Client({ name: "remote-test", version: "0.0.0" });
  await client.connect(transport);
  clients.push(client);
  return client;
}

async function call(c: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await c.callTool({ name, arguments: args });
  const blocks = res.content as TextBlock[];
  return { isError: Boolean(res.isError), text: blocks[0].text, json: res.isError ? undefined : JSON.parse(blocks[1].text) };
}

const rawPost = (body: unknown, headers: Record<string, string> = {}) =>
  mcpPost(
    new Request(URL_MCP, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
    }),
  );
const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "curl", version: "0" } } };

describe("personal MCP tokens (/api/mcp-tokens)", () => {
  it("creates a token shown once, stores only its hash, lists it and revokes it", async () => {
    await loginDemo();
    const created = await newToken();
    expect(created.token).toMatch(/^mcn_[\w-]{40,}$/);
    expect(created.endpoint).toBe(URL_MCP);
    expect(created.info.label).toBe("Claude Desktop");
    expect(created.info.prefix).toBe(`${created.token.slice(0, 10)}…`);
    const stored = readDb().mcpTokens;
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(readDb())).not.toContain(created.token);

    const list = McpTokensResponse.parse(await (await listTokens(req("/api/mcp-tokens"))).json());
    expect(list.tokens.map((t) => t.id)).toEqual([created.info.id]);
    expect(JSON.stringify(list)).not.toContain(created.token);

    const del = await revokeToken(req(`/api/mcp-tokens/${created.info.id}`, { method: "DELETE" }), ctx({ id: created.info.id }));
    expect(del.status).toBe(200);
    expect(readDb().mcpTokens).toHaveLength(0);
  });

  it("needs a session, and nobody can list or revoke another user's tokens", async () => {
    expect((await listTokens(req("/api/mcp-tokens", { cookie: null }))).status).toBe(401);
    expect((await createToken(req("/api/mcp-tokens", { body: {}, cookie: null }))).status).toBe(401);
    await loginDemo();
    const mine = await newToken();
    const other = await createUser("otra@mecena.test");
    const theirs = McpTokensResponse.parse(await (await listTokens(req("/api/mcp-tokens", { cookie: other.cookie }))).json());
    expect(theirs.tokens).toEqual([]);
    const del = await revokeToken(req(`/api/mcp-tokens/${mine.info.id}`, { method: "DELETE", cookie: other.cookie }), ctx({ id: mine.info.id }));
    expect(del.status).toBe(404);
    expect(readDb().mcpTokens).toHaveLength(1);
  });

  it("caps the number of tokens per account", async () => {
    await loginDemo();
    for (let i = 0; i < 10; i++) await newToken(undefined, `t${i}`);
    const res = await createToken(req("/api/mcp-tokens", { body: { label: "una más" } }));
    expect(res.status).toBe(429);
  });
});

describe("remote MCP endpoint (/api/mcp)", () => {
  it("initialize → tools/list → tools/call as the token's user, on the app's data", async () => {
    await loginDemo();
    await seedOnboardedCreator();
    const { token } = await newToken();
    const c = await connect(token);
    expect(c.getInstructions()).toMatch(/Mecena prepara/);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());

    const profile = await call(c, "get_profile");
    expect(profile.isError).toBe(false);
    expect(profile.json.profile.id).toBe("demo-creator");

    const found = await call(c, "search_calls");
    expect(found.text).toMatch(/He encontrado \d+ convocatoria/);
    expect(found.text).toContain("http://localhost:3000/convocatorias/");
  });

  it("the full demo beat: dossier for a call + PDF, with a purchase made in the app (Pro)", async () => {
    await loginDemo();
    await seedOnboardedCreator();
    const { token } = await newToken();
    const c = await connect(token);
    const denied = await call(c, "draft_application", { callId: CALL_ID });
    expect(denied.isError).toBe(true);
    expect(denied.text).toMatch(/se guarda en tu cuenta de Mecena/); // remote: a phone purchase really counts here

    await grantPro(DEMO_APP_USER_ID); // e.g. the RevenueCat sandbox purchase on the phone
    const dossier = await call(c, "build_dossier", { callId: CALL_ID });
    expect(dossier.json.adapted).toBe(true);
    expect(dossier.text).toContain("Adaptado a la convocatoria");
    const pdf = await call(c, "export_dossier_pdf", { callId: CALL_ID });
    expect(pdf.isError).toBe(false);
    expect(pdf.json.url).toBe(`http://localhost:3000/api/dossier/pdf?profileId=demo-creator&callId=${CALL_ID}`);
    expect(pdf.json).not.toHaveProperty("filePath");
  });

  it("tokens are per user: each sees only their own profile", async () => {
    await loginDemo();
    const demo = await newToken();
    const other = await createUser("otra@mecena.test");
    const theirs = await newToken(other.cookie);
    const mine = await connect(demo.token);
    const them = await connect(theirs.token);
    expect((await call(mine, "get_profile")).json.profile.id).toBe("demo-creator");
    expect((await call(them, "get_profile")).json.profile.id).toBe(other.user.activeProfileId);
    const peek = await call(them, "get_profile", { profileId: "demo-creator" });
    expect(peek.isError).toBe(true);
    expect(peek.text).toMatch(/no encontrad/i);
  });

  it("without a token, or with a wrong or revoked one, answers 401 with a Spanish hint", async () => {
    await loginDemo();
    const none = await rawPost(INIT);
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect((await none.json()).error.message).toMatch(/Falta tu token de Mecena.*Conectar con Claude/);

    const wrong = await rawPost(INIT, { authorization: "Bearer mcn_nope" });
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error.message).toMatch(/no válido o revocado/);

    const { token, info } = await newToken();
    expect((await rawPost(INIT, { authorization: `Bearer ${token}` })).status).toBe(200);
    await revokeToken(req(`/api/mcp-tokens/${info.id}`, { method: "DELETE" }), ctx({ id: info.id }));
    expect((await rawPost(INIT, { authorization: `Bearer ${token}` })).status).toBe(401);
  });

  it("a session cookie is not enough (no CSRF from the browser): only the bearer token counts", async () => {
    const { cookie } = await loginDemo();
    expect((await rawPost(INIT, { cookie })).status).toBe(401);
  });

  it("is stateless: GET and DELETE are 405 with a valid token", async () => {
    await loginDemo();
    const { token } = await newToken();
    const auth = { authorization: `Bearer ${token}` };
    expect((await mcpGet(new Request(URL_MCP, { headers: { ...auth, accept: "text/event-stream" } }))).status).toBe(405);
    expect((await mcpDelete(new Request(URL_MCP, { method: "DELETE", headers: auth }))).status).toBe(405);
  });

  it("rate-limits tool calls per user with a Spanish tool error", async () => {
    await loginDemo();
    const { token } = await newToken();
    const c = await connect(token);
    for (let i = 0; i < MCP_TOOL_LIMIT.attempts; i++) expect((await call(c, "get_profile")).isError).toBe(false);
    const limited = await call(c, "get_profile");
    expect(limited.isError).toBe(true);
    expect(limited.text).toMatch(/muchas peticiones/);
  });

  it("rejects oversized bodies", async () => {
    await loginDemo();
    const { token } = await newToken();
    const res = await rawPost({ ...INIT, params: { ...INIT.params, padding: "x".repeat(300 * 1024) } }, { authorization: `Bearer ${token}` });
    expect(res.status).toBe(413);
  });

  it("the proxy lets /api/mcp through without a cookie or Basic auth, but not the token routes", () => {
    process.env.BASIC_AUTH_PASSWORD = "secreto";
    try {
      const mk = (path: string) => new NextRequest(`https://mecena.example${path}`, { method: "POST", headers: { authorization: "Bearer mcn_x" } });
      expect(proxy(mk("/api/mcp")).status).toBe(200);
      expect(proxy(mk("/api/mcp-tokens")).status).toBe(401);
    } finally {
      delete process.env.BASIC_AUTH_PASSWORD;
    }
    const noCookie = (path: string) => new NextRequest(`https://mecena.example${path}`, { method: "POST" });
    expect(proxy(noCookie("/api/mcp")).status).toBe(200);
    expect(proxy(noCookie("/api/mcp-tokens")).status).toBe(401);
  });
});
