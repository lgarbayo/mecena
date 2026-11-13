// @vitest-environment jsdom
/** Call-adapted dossier content (layer 2, CCR-7): mock adaptation, number guard, cache, Pro gate, view and render. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Call } from "@/contracts";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID, fixtureCalls } from "@/fixtures";
import { __test, dossierAi, formatChecks } from "@/features/dossier/ai";
import { unsupportedNumbers } from "@/features/dossier/adapt";
import { buildDossier, loadDossierData } from "@/features/dossier/service";
import { splitPending, toDossierView } from "@/features/dossier/model";
import { DossierDocument } from "@/features/dossier/ui/DossierDocument";
import { VariantPanel } from "@/features/dossier/ui/DossierScreen";
import { GET as dossierRoute } from "@/app/api/dossier/route";
import { getProfile, readDb, saveDossier } from "@/server/store";
import { ruleMatch } from "@/features/matching/service";
import { grantPro, req, seedOnboardedCreator } from "../helpers";
import { writeCalls } from "./fixtures";

const beca: Call = structuredClone(fixtureCalls[0]); // criteria: calidad 40, proyecto 40 (calendario y presupuesto), territorio 20

async function seed() {
  await seedOnboardedCreator();
  const profile = getProfile(DEMO_CREATOR_ID);
  await saveDossier({
    profileId: profile.id,
    kind: "creator",
    workIds: [],
    generatedAt: "2026-11-13T10:00:00.000Z",
    sections: [
      { key: "statement", title: "Declaración artística", body: "Pinto la costa de A Coruña y la provincia: el territorio y sus rederas.", sourceSegmentIds: ["s1"], status: "draft", updatedAt: "2026-11-13T10:00:00.000Z" },
      { key: "cv", title: "Trayectoria", body: "- 2021 Premio de calidad artística en Ferrol\n- 2023 Exposición individual en Betanzos", sourceSegmentIds: ["s2"], status: "draft", updatedAt: "2026-11-13T10:00:00.000Z" },
      { key: "contact", title: "Contacto", body: "hola@example.org", sourceSegmentIds: [], status: "draft", updatedAt: "2026-11-13T10:00:00.000Z" },
    ],
  });
  writeCalls([beca]);
  return getProfile(DEMO_CREATOR_ID);
}

describe("mock adaptation", () => {
  it("orders sections by criterion weight, fills them from the base dossier and never invents the budget", async () => {
    const profile = await seed();
    const sections = readDb().dossiers[0].sections;
    const out = __test.mockAdapt({ profile, call: beca, sections, works: [], transcript: [], match: ruleMatch(profile, beca) });
    expect(out.sections.map((s) => s.id)).toEqual(["calidad", "proyecto", "territorio"]);
    expect(out.sections[0].body).toMatch(/Premio de calidad artística/);
    expect(out.sections[2].body).toMatch(/territorio/);
    const proyecto = out.sections[1];
    expect(proyecto.body).toMatch(/\[PENDIENTE: presupuesto desglosado/);
    expect(out.questions.find((q) => q.criterionId === "proyecto")?.question).toMatch(/Cuánto cuesta/);
    expect(out.strategy).toMatch(/«Calidad artística de la trayectoria» \(40 puntos\)/);
  });

  it("format checks cover the call's limits and every required document", () => {
    const checks = formatChecks(beca, 12);
    expect(checks[0]).toEqual({ rule: "Máximo 10 imágenes", status: "ok", note: "Van 10." });
    expect(checks.some((c) => /dossier/i.test(c.rule) && c.status === "ok")).toBe(true);
    expect(checks.filter((c) => c.status === "no_aplica").length).toBeGreaterThan(0);
  });
});

describe("number guard", () => {
  it("flags numbers that are not in the facts, ignoring placeholders, list numbers and thousand separators", () => {
    const facts = JSON.stringify({ premio: "Premio 2021", importe: "Hasta 12000 €" });
    const out = unsupportedNumbers(["En 2021 gané el premio. Pido 12.000 €. Expuse 45 obras. [PENDIENTE: 3.500 € de materiales] 1 de cada 4"], facts);
    expect(out).toEqual(["45"]);
  });
});

describe("buildDossier with content adaptation", () => {
  it("adds rewritten sections to the variant and caches them", async () => {
    await seed();
    const d = await buildDossier({ profileId: DEMO_CREATOR_ID, callId: beca.id });
    expect(d.variant?.sections?.map((s) => s.id)).toEqual(["calidad", "proyecto", "territorio"]);
    expect(d.variant?.sections).toHaveLength(3);
    expect(d.variant?.generatedBy).toBe("mock");
    expect(d.variant?.notes.length).toBeGreaterThan(0); // rules notes kept
    expect(readDb().variantCache).toHaveLength(1);

    const spy = vi.spyOn(dossierAi.mock, "adaptDossier");
    await buildDossier({ profileId: DEMO_CREATOR_ID, callId: beca.id });
    expect(spy).not.toHaveBeenCalled(); // cache hit
    spy.mockRestore();
  });

  it("the free preview (ai: false) never calls the model", async () => {
    await seed();
    const spy = vi.spyOn(dossierAi.mock, "adaptDossier");
    const d = await buildDossier({ profileId: DEMO_CREATOR_ID, callId: beca.id, ai: false });
    expect(spy).not.toHaveBeenCalled();
    expect(d.variant?.sections).toBeUndefined();
    spy.mockRestore();
  });

  it("falls back to the deterministic version when the model fails, without caching it", async () => {
    await seed();
    const spy = vi.spyOn(dossierAi.mock, "adaptDossier").mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const d = await buildDossier({ profileId: DEMO_CREATOR_ID, callId: beca.id });
    expect(d.variant?.sections).toHaveLength(3);
    expect(readDb().variantCache).toHaveLength(0);
    spy.mockRestore();
    err.mockRestore();
  });

  it("drops unknown criteria ids and source keys returned by the model", async () => {
    await seed();
    const spy = vi.spyOn(dossierAi.mock, "adaptDossier").mockResolvedValueOnce({
      strategy: "x",
      sections: [{ id: "a", heading: "Calidad", body: "Texto con 999 obras.", criteria: ["calidad", "inventado"], from: ["statement", "nada"] }],
      omitted: [],
      questions: [{ criterionId: "zzz", question: "¿?" }],
      formatChecks: [],
    });
    const d = await buildDossier({ profileId: DEMO_CREATOR_ID, callId: beca.id });
    const s = d.variant!.sections![0];
    expect(s.criteria).toEqual(["calidad"]);
    expect(s.from).toEqual(["statement"]);
    expect(d.variant!.questions![0].criterionId).toBe("");
    expect(d.variant!.unsupportedNumbers).toEqual(["999"]);
    expect(d.variant!.formatChecks!.length).toBeGreaterThan(0); // completed from the call's rules
    spy.mockRestore();
  });
});

describe("Pro gate on GET /api/dossier", () => {
  it("non-Pro: notes only, no rewritten sections", async () => {
    await seed();
    const body = await (await dossierRoute(req(`/api/dossier?profileId=${DEMO_CREATOR_ID}&callId=${beca.id}&appUserId=nobody`))).json();
    expect(body.adapted).toBe(false);
    expect(body.dossier.variant.sections).toBeUndefined();
  });

  it("Pro: rewritten sections", async () => {
    await seed();
    await grantPro();
    const body = await (await dossierRoute(req(`/api/dossier?profileId=${DEMO_CREATOR_ID}&callId=${beca.id}&appUserId=${DEMO_APP_USER_ID}`))).json();
    expect(body.adapted).toBe(true);
    expect(body.dossier.variant.sections).toHaveLength(3);
  });
});

describe("view and render", () => {
  it("splits pending gaps", () => {
    expect(splitPending("Hola [PENDIENTE: presupuesto] fin")).toEqual([
      { text: "Hola ", pending: false },
      { text: "presupuesto", pending: true },
      { text: " fin", pending: false },
    ]);
  });

  it("renders the adapted sections instead of statement and bio, with criteria chips and gaps", async () => {
    await seed();
    const data = await loadDossierData({ profileId: DEMO_CREATOR_ID, callId: beca.id });
    const view = toDossierView(data);
    expect(view.variant?.sections[0].criteria).toEqual(["Calidad artística de la trayectoria · 40 ptos"]);
    const { container } = render(<DossierDocument view={view} />);
    expect(container.querySelectorAll('[data-section="variant"]')).toHaveLength(3);
    expect(container.querySelector('[data-section="statement"]')).toBeNull();
    expect(container.querySelector(".pending-gap")?.textContent).toMatch(/presupuesto/);
    render(<VariantPanel variant={view.variant!} />);
    expect(screen.getByTestId("variant-panel").textContent).toMatch(/Para sumar puntos/);
  });

  it("renders a real PDF for the adapted variant", async () => {
    await seed();
    const { renderDossierPdf } = await import("@/features/dossier/service");
    const bytes = await renderDossierPdf({ profileId: DEMO_CREATOR_ID, callId: beca.id });
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(5000); // not the one-page fallback
  });
});
