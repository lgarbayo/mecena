/**
 * The tools keep the app's paywalls and tell the truth, through every front door (MCP here, the agent uses the same
 * registry): the free plan's top-3 matches, the Pro dossier variant, call status, no server paths, Spanish errors.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FREE_MATCHES_PER_MONTH, PaymentRequiredError, type ToolContext } from "@/contracts";
import { createMcpServer } from "@/mcp/server";
import { runTool } from "@/tools/registry";
import { toolErrorMessage } from "@/tools/present";
import { readDb } from "@/server/store";
import { DEMO_EMAIL, demoToolCtx, grantPro, loginDemo, seedOnboardedCreator } from "../helpers";
import { paywallCalls, writeCalls } from "./calls";

type TextBlock = { type: "text"; text: string };
const BECA = "fixture-beca-artes-plasticas";

let client: Client | undefined;
beforeEach(async () => {
  await loginDemo();
  await seedOnboardedCreator();
});
afterEach(async () => {
  await client?.close();
  client = undefined;
});

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([createMcpServer({ userEmail: DEMO_EMAIL }).connect(a), client.connect(b)]);
  return client;
}
async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await (client ?? (await connect())).callTool({ name, arguments: args });
  const blocks = res.content as TextBlock[];
  return { isError: Boolean(res.isError), text: blocks[0].text, json: res.isError ? undefined : JSON.parse(blocks[1].text) };
}

describe("search_calls: free limit and status", () => {
  beforeEach(() => writeCalls(paywallCalls()));

  it("without Pro shows the top 3 matches only and says how many more Pro unlocks", async () => {
    const r = await call("search_calls");
    expect(r.isError).toBe(false);
    expect(r.json.results).toHaveLength(FREE_MATCHES_PER_MONTH);
    expect(r.json.pro).toBe(false);
    expect(r.json.lockedCount).toBe(4); // 6 open + 1 upcoming, minus the 3 free ones
    expect(r.text).toContain("Tienes 4 más con Mecena Pro: http://localhost:3000/pro");
  });

  it("with Pro shows every open/upcoming match and no Pro line", async () => {
    await grantPro();
    const r = await call("search_calls");
    expect(r.json.results).toHaveLength(7);
    expect(r.json.lockedCount).toBe(0);
    expect(r.text).not.toContain("Mecena Pro");
  });

  it("a query cannot reveal a call beyond the free ones", async () => {
    const free = (await call("search_calls")).json.results.map((x: { call: { id: string } }) => x.call.id) as string[];
    const locked = paywallCalls().find((c) => c.status === "open" && !free.includes(c.id))!;
    const word = locked.title.split(" ")[1]; // its unique word ("delta"…)
    const r = await call("search_calls", { query: word });
    expect(r.json.results).toHaveLength(0);
    expect(r.json.lockedCount).toBe(1);
    expect(r.text).toMatch(/no coinciden con esta búsqueda/);
    expect(r.text).toContain("Tienes 1 más con Mecena Pro");
  });

  it("puts the status on every line and leaves closed recurring calls out unless asked", async () => {
    await grantPro();
    const r = await call("search_calls");
    expect(r.json.results.map((x: { call: { id: string } }) => x.call.id)).not.toContain("xuventude-crea-2026");
    expect(r.json.closedCount).toBe(1);
    const lines = r.text.split("\n").filter((l: string) => /^\d+\. /.test(l));
    expect(lines).toHaveLength(7);
    for (const l of lines) expect(l).toMatch(/ · (abierta|abre el 16\/04\/2027) · /);
    expect(r.text).toMatch(/convocatorias abiertas o próximas que encajan/);
    expect(r.text).toMatch(/1 convocatoria recurrente .* ya cerró; pídemelas/);

    const all = await call("search_calls", { includeClosed: true });
    const xuventude = all.text.split("\n").find((l: string) => l.includes("Xuventude"));
    expect(xuventude).toContain("cerrada; abre de nuevo en 2027");
    expect(all.text).not.toMatch(/abiertas o próximas/);
  });

  it("explain_call respects the free limit too", async () => {
    const free = (await call("search_calls")).json.results.map((x: { call: { id: string } }) => x.call.id) as string[];
    const locked = paywallCalls().find((c) => !free.includes(c.id))!;
    expect((await call("explain_call", { callId: free[0] })).isError).toBe(false);
    const denied = await call("explain_call", { callId: locked.id });
    expect(denied.isError).toBe(true);
    expect(denied.text).toMatch(/^Con el plan gratuito ves tus 3 convocatorias destacadas.*Desbloquéalo aquí: http:\/\/localhost:3000\/pro/);
    await grantPro();
    expect((await call("explain_call", { callId: locked.id })).isError).toBe(false);
  });

  it("an unknown call is 'not found', not a paywall", async () => {
    const r = await call("explain_call", { callId: "no-existe" });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/no encontramos/i);
  });
});

describe("dossier call variant is Pro", () => {
  it("build_dossier without Pro: general dossier with the call's notes, says the adaptation is Pro, no AI run", async () => {
    const r = await call("build_dossier", { callId: BECA });
    expect(r.isError).toBe(false);
    expect(r.json.adapted).toBe(false);
    expect(r.json.dossier.variant.callId).toBe(BECA); // notes as a preview, like the /dossier page shows
    expect(r.text).not.toContain("Adaptado a la convocatoria");
    expect(r.text).toContain("es de Mecena Pro: http://localhost:3000/pro");
    expect(r.text).toContain(r.json.url);
    expect(readDb().variantCache).toHaveLength(0);
  });

  it("build_dossier with Pro adapts it, and the link is the call variant page", async () => {
    await grantPro();
    const r = await call("build_dossier", { callId: BECA });
    expect(r.json.adapted).toBe(true);
    expect(r.text).toContain("Adaptado a la convocatoria «Beca de creación en artes plásticas»");
    expect(new URL(r.json.url).searchParams.get("callId")).toBe(BECA);
  });

  it("export_dossier_pdf: general PDF without Pro, the call version with Pro; never a server path", async () => {
    const free = await call("export_dossier_pdf", { callId: BECA });
    expect(free.json).not.toHaveProperty("filePath");
    expect(JSON.stringify(free.json)).not.toMatch(/runtime|exports|mecena-test/);
    expect(free.json.adapted).toBe(false);
    expect(new URL(free.json.url).searchParams.get("callId")).toBeNull();
    expect(free.text).toMatch(/Es tu dossier general: la versión adaptada a «Beca de creación en artes plásticas» es de Mecena Pro/);

    await grantPro();
    const pro = await call("export_dossier_pdf", { callId: BECA });
    expect(pro.json.adapted).toBe(true);
    expect(new URL(pro.json.url).searchParams.get("callId")).toBe(BECA);
    expect(pro.text).toMatch(/^PDF del dossier adaptado a «Beca de creación en artes plásticas»/);
  });
});

describe("errors in Spanish", () => {
  it("bad arguments are reported in Spanish over MCP (the SDK's own check included)", async () => {
    const r = await call("explain_call", {});
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/^Datos de entrada no válidos: callId: Entrada inválida/);
    expect(r.text).not.toMatch(/Invalid|Input validation/);
  });

  it("runTool validation is Spanish for the agent too", async () => {
    await expect(runTool("search_calls", { limit: 99 }, await demoToolCtx())).rejects.toThrow(/Demasiado grande/);
  });

  it("unexpected errors do not leak internals", () => {
    expect(toolErrorMessage(new Error("ENOENT: /data/runtime/db.json"))).toBe("Algo ha fallado al ejecutar esta herramienta. Inténtalo de nuevo en unos segundos.");
  });

  it("the paywall message says where a purchase counts, per front door", () => {
    const e = new PaymentRequiredError();
    const callers: ToolContext["caller"][] = ["app", "mcp-remote", "mcp"];
    const [app, remote, local] = callers.map((c) => toolErrorMessage(e, c));
    for (const m of [app, remote, local]) expect(m).toMatch(/^Necesitas Mecena Pro o una Solicitud premium para preparar la solicitud\. Desbloquéalo aquí: http:\/\/localhost:3000\/pro/);
    expect(app).not.toMatch(/Claude/);
    expect(remote).toMatch(/se guarda en tu cuenta de Mecena.*también desde el móvil/);
    expect(local).toMatch(/servidor MCP local lee los datos de este ordenador/);
    expect(local).toMatch(/Conectar con Claude/);
    for (const m of [app, remote, local]) expect(m).not.toMatch(/una compra hecha en el móvil también desbloquea Claude Desktop/);
  });
});
