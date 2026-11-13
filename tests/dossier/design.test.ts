import { describe, expect, it } from "vitest";
import type { Call } from "@/contracts";
import { fixtureCalls, fixtureCreator, fixtureWorks } from "@/fixtures";
import { mockDesign } from "@/features/dossier/ai";
import { contrast, DossierDesign, guardDesign, presetDesign } from "@/features/dossier/design";
import { renderDossierPdf } from "@/features/dossier/service";
import { GET, POST } from "@/app/api/dossier/design/route";
import { appendSegment } from "@/server/store";
import { req, seedOnboardedCreator } from "../helpers";
import { seedUploadWork } from "./fixtures";

const call = (patch: Partial<Call>): Call => ({ ...structuredClone(fixtureCalls[0]), ...patch });
const agent = (request: string, extra: Partial<Parameters<typeof mockDesign>[0]> = {}) =>
  mockDesign({ request, current: presetDesign("sobrio", "creator"), profile: fixtureCreator, workColors: ["#2f6a9a"], history: [], ...extra });

describe("design agent (literal reading)", () => {
  it("applies an open request on top of the current design", () => {
    const d = agent("Más oscuro, como una noche en el puerto, con acento rojo y que la obra respire");
    expect(contrast(d.palette.ink, d.palette.paper)).toBeGreaterThan(7);
    expect(d.palette.paper).toBe("#16191d");
    expect(d.palette.accent).toBe("#a3362a");
    expect(d.rhythm.density).toBe("aireada");
    expect(d.rationale).toMatch(/fondo oscuro/);
    expect(DossierDesign.safeParse(d).success).toBe(true);
  });

  it("knows a fanzine from a museum catalogue, and keeps the artist's words for sections", () => {
    const zine = agent("que parezca un fanzine con mis piezas");
    expect(zine.type.display).toMatchObject({ category: "mono", uppercase: true });
    expect(zine.titles.works).toBe("Piezas");
    const museum = agent("como un catálogo de museo");
    expect(museum.type.display.category).toBe("serif");
  });

  it("says so when it does not understand, instead of inventing", () => {
    const d = agent("hmm");
    expect(d.rationale).toMatch(/No he entendido/);
  });
});

describe("design guard rails", () => {
  it("fixes unreadable colours and explains it", () => {
    const bad = presetDesign("sobrio", "creator");
    bad.palette = { ...bad.palette, paper: "#ffffff", ink: "#cccccc", muted: "#eeeeee", backPaper: "#222222", backInk: "#333333" };
    const { design, adjustments } = guardDesign(bad);
    expect(contrast(design.palette.ink, design.palette.paper)).toBeGreaterThanOrEqual(7);
    expect(contrast(design.palette.muted, design.palette.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(design.palette.backInk, design.palette.backPaper)).toBeGreaterThanOrEqual(7);
    expect(adjustments.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps public-aid dossiers legible: no handwriting titles, no mono running text", () => {
    const d = presetDesign("sobrio", "creator");
    d.type.display = { ...d.type.display, family: "Caveat", category: "handwriting" };
    d.type.body = { ...d.type.body, family: "Space Mono", category: "mono" };
    const { design } = guardDesign(d, { call: call({ type: "ayuda" }) });
    expect(design.type.display.category).toBe("serif");
    expect(design.type.body.category).toBe("serif");
    // The same design is fine for a fanzine prize.
    expect(guardDesign(d, { call: call({ type: "premio" }) }).design.type.display.family).toBe("Caveat");
  });
});

describe("design API and PDF", () => {
  it("starts from the look that suits the call, saves each request and undoes it", async () => {
    await seedOnboardedCreator();
    const start = await (await GET(req("/api/dossier/design"))).json();
    expect(start.saved).toBe(false);

    const res = await POST(req("/api/dossier/design", { body: { request: "más oscuro y tipo fanzine", workColors: ["#2f6a9a"] } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.design.palette.paper).toBe("#16191d");
    expect(body.design.type.display.uppercase).toBe(true);

    const now = await (await GET(req("/api/dossier/design"))).json();
    expect(now).toMatchObject({ saved: true, history: ["más oscuro y tipo fanzine"] });

    const undone = await (await POST(req("/api/dossier/design", { body: { undo: true } }))).json();
    expect(undone.design.name).toBe(start.design.name);
  });

  it("asks for words when the request is empty", async () => {
    await seedOnboardedCreator();
    const res = await POST(req("/api/dossier/design", { body: { request: "  " } }));
    expect(res.status).toBe(400);
  });

  it("renders the PDF with the saved design (fonts fall back offline)", async () => {
    await seedOnboardedCreator();
    await seedUploadWork(fixtureWorks[0].id, fixtureWorks[0].sheet, 0);
    await POST(req("/api/dossier/design", { body: { request: "noche, como un catálogo de museo, cartela debajo, mis piezas" } }));
    const bytes = await renderDossierPdf({});
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(5000);
  });

  it("designs the first look by itself from the interview, and never overwrites the artist's own", async () => {
    await seedOnboardedCreator();
    await appendSegment(fixtureCreator.id, "Pinto al óleo los bancales de viña de la Ribeira Sacra, sobre todo en otoño, después de la vendimia.", "voice");
    const first = await (await POST(req("/api/dossier/design", { body: { auto: true, workColors: ["#8c3b26"] } }))).json();
    expect(first.design.rationale).toMatch(/la tierra y la viña de las que hablas/);
    expect(first.design.rationale).toMatch(/dímelo con tus palabras/);
    expect(first.design.palette.paper).toBe("#f6efe3");

    await POST(req("/api/dossier/design", { body: { request: "más oscuro" } }));
    const again = await (await POST(req("/api/dossier/design", { body: { auto: true } }))).json();
    expect(again.design.palette.paper).toBe("#16191d");
    const now = await (await GET(req("/api/dossier/design"))).json();
    expect(now.history).toEqual(["Primer diseño, a partir de tu entrevista", "más oscuro"]);
  });
});
