/** WP-04: in-app agent in mock mode (keyword router) and the /api/agent route. */
import { describe, expect, it, beforeEach } from "vitest";
import { AgentResponse } from "@/contracts/api";
import { POST } from "@/app/api/agent/route";
import { planMockTurn, resolveCallId, MOCK_HELP } from "@/features/agent/mock";
import { runAgent } from "@/features/agent/service";
import { grantPro, req, seedOnboardedCreator, loginDemo, demoToolCtx } from "../helpers";
import { testCall, writeCalls } from "../mcp/calls";

const CALL_ID = "fixture-beca-artes-plasticas";

// Route handlers need a session: run as the demo account (owns the fixture profiles).
beforeEach(async () => {
  await loginDemo();
});

describe("mock router", () => {
  it.each([
    ["¿Qué convocatorias encajan conmigo?", "search_calls"],
    ["Búscame becas para ilustración", "search_calls"],
    ["¿Hay ayudas o subvenciones para mi negocio?", "search_calls"],
    ["Hazme el dossier para la convocatoria de artes plásticas", "build_dossier"],
    ["Pásame el dossier en PDF", "export_dossier_pdf"],
    ["Prepárame la solicitud para la beca de artes plásticas", "draft_application"],
    ["Explícame las bases de la beca de artes plásticas", "explain_call"],
    ["¿Quién soy en mi perfil?", "get_profile"],
  ])("%s → %s", async (message, tool) => {
    await seedOnboardedCreator();
    const plan = planMockTurn(message);
    expect("tool" in plan && plan.tool).toBe(tool);
  });

  it("resolves calls by id or by title words, accent-insensitive", () => {
    expect(resolveCallId(`dossier para ${CALL_ID}`)).toBe(CALL_ID);
    expect(resolveCallId("la de artes plasticas")).toBe(CALL_ID);
    expect(resolveCallId("el premio de ilustración")).toBe("fixture-premio-ilustracion");
    expect(resolveCallId("algo que no existe")).toBeUndefined();
  });

  it("dossier for a named call passes the callId", () => {
    expect(planMockTurn("hazme el dossier para la convocatoria de artes plásticas")).toEqual({ tool: "build_dossier", input: { callId: CALL_ID } });
  });

  it("asks back instead of guessing when the call or the application is missing", async () => {
    const draft = planMockTurn("prepárame la solicitud");
    expect("reply" in draft && draft.reply).toMatch(/¿Para qué convocatoria/);
    const score = planMockTurn("que la puntúe el tribunal");
    expect("reply" in score && score.reply).toMatch(/Todavía no tienes ninguna solicitud/);
    expect(planMockTurn("hola")).toEqual({ reply: MOCK_HELP });
  });
});

describe("runAgent (mock mode)", () => {
  it("search: Spanish reply with results and the tool call", async () => {
    await seedOnboardedCreator();
    const turn = await runAgent("¿Qué convocatorias encajan conmigo?", [], await demoToolCtx());
    expect(turn.toolCalls).toEqual([{ name: "search_calls", input: { limit: 5 }, ok: true }]);
    expect(turn.reply).toMatch(/He encontrado \d+ convocatoria/);
  });

  it("dossier for call X returns the dossier link", async () => {
    await seedOnboardedCreator();
    const turn = await runAgent("Hazme el dossier para la convocatoria de artes plásticas", [], await demoToolCtx());
    expect(turn.toolCalls[0]).toMatchObject({ name: "build_dossier", input: { callId: CALL_ID }, ok: true });
    expect(turn.reply).toContain("http://localhost:3000/dossier?");
  });

  it("solicitud without entitlement → paywall message (ok: false); with Pro → draft; then tribunal scores it", async () => {
    await seedOnboardedCreator();
    const denied = await runAgent("Prepárame la solicitud de la beca de artes plásticas", [], await demoToolCtx());
    expect(denied.toolCalls[0]).toMatchObject({ name: "draft_application", ok: false });
    expect(denied.reply).toMatch(/^Necesitas Mecena Pro/);
    expect(denied.reply).toContain("/pro");

    await grantPro();
    const drafted = await runAgent("Prepárame la solicitud de la beca de artes plásticas", [], await demoToolCtx());
    expect(drafted.toolCalls[0]).toMatchObject({ name: "draft_application", ok: true });
    expect(drafted.reply).toMatch(/Mecena prepara; tú presentas/);

    const scored = await runAgent("Que la puntúe el tribunal", [], await demoToolCtx());
    expect(scored.toolCalls[0]).toMatchObject({ name: "score_application", ok: true });
    expect(scored.reply).toMatch(/\d+\/100/);
  });

  it("uses the caller's appUserId (from the tool context) for entitlement", async () => {
    await seedOnboardedCreator();
    await grantPro("someone-else");
    const mine = await runAgent("Prepárame la solicitud de la beca de artes plásticas", [], { ...(await demoToolCtx()), appUserId: "someone-else" });
    expect(mine.toolCalls[0].ok).toBe(true);
  });
});

describe("POST /api/agent", () => {
  it("returns an AgentResponse", async () => {
    await seedOnboardedCreator();
    const res = await POST(req("/api/agent", { body: { message: "¿Qué convocatorias encajan conmigo?" } }));
    expect(res.status).toBe(200);
    const data = AgentResponse.parse(await res.json());
    expect(data.toolCalls[0].name).toBe("search_calls");
  });

  it("rejects an empty message with 400", async () => {
    const res = await POST(req("/api/agent", { body: { message: "" } }));
    expect(res.status).toBe(400);
  });
});

describe("mock router: resolving the call by name (real-world titles)", () => {
  beforeEach(() => {
    writeCalls([
      testCall("ua-bienal-pluri-identitats-2027", { title: "Premios V Bienal de Artes Visuales Pluri-identitats 2027", organizer: "Universidad de Alicante", deadline: "2027-01-08" }),
      testCall("lasalita-gijon-el-paisaje-2026", { title: "Convocatoria de arte plástica «El Paisaje»", organizer: "La Salita (Gijón)", deadline: "2026-12-06" }),
      testCall("premios-que-arte-2026", { title: "Premios Qué! Arte 2026", organizer: "Qué! Arte", deadline: "2026-12-10" }),
      testCall("cromawards-2026", { title: "cromAwards 2026 · Concurso internacional de arte y diseño", organizer: "cromAwards", deadline: "2026-12-21" }),
      testCall("pintura-rapida-2025", { title: "Certamen de pintura rápida", organizer: "Concello", status: "recurring", deadline: null }),
      testCall("pintura-rapida-2026", { title: "Certamen de pintura rápida", organizer: "Concello", deadline: "2026-12-20" }),
    ]);
  });

  it("plural and accents are the same words: «artes plásticas» is the «arte plástica» call", () => {
    expect(resolveCallId("hazme el dossier para la convocatoria de artes plásticas")).toBe("lasalita-gijon-el-paisaje-2026");
    expect(resolveCallId("la de ARTE PLASTICA")).toBe("lasalita-gijon-el-paisaje-2026");
  });

  it("the whole phrase wins over a single shared word", () => {
    expect(resolveCallId("explícame las bases de premios qué arte")).toBe("premios-que-arte-2026");
    expect(resolveCallId("…convocatoria premios qué arte")).toBe("premios-que-arte-2026");
    expect(resolveCallId("la bienal de artes visuales")).toBe("ua-bienal-pluri-identitats-2027");
  });

  it("on a tie, the call you can still apply to", () => {
    expect(resolveCallId("el certamen de pintura rápida")).toBe("pintura-rapida-2026");
  });

  it("the example in MOCK_HELP resolves to an open call", () => {
    const example = /«(hazme el dossier[^»]*)»/.exec(MOCK_HELP)?.[1];
    expect(example).toBeTruthy();
    const plan = planMockTurn(example!);
    expect(plan).toEqual({ tool: "build_dossier", input: { callId: "premios-que-arte-2026" } });
  });
});
