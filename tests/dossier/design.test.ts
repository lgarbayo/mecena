import { describe, expect, it, beforeEach } from "vitest";
import type { Call } from "@/contracts";
import { fixtureCalls, fixtureCreator, fixtureWorks, DEMO_CREATOR_ID } from "@/fixtures";
import { mockDesign } from "@/features/dossier/ai";
import { contrast, DossierDesign, guardDesign, presetDesign } from "@/features/dossier/design";
import { renderDossierPdf } from "@/features/dossier/service";
import { GET, POST } from "@/app/api/dossier/design/route";
import { appendSegment } from "@/server/store";
import { req, seedOnboardedCreator, loginDemo } from "../helpers";
import { seedUploadWork } from "./fixtures";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/server/store";
import { dossierLookRequests, isDossierLookSentence } from "@/features/onboarding/interview";
import { pendingDesigns, processTurn } from "@/features/onboarding/service";

const call = (patch: Partial<Call>): Call => ({ ...structuredClone(fixtureCalls[0]), ...patch });
const agent = (request: string, extra: Partial<Parameters<typeof mockDesign>[0]> = {}) =>
  mockDesign({ request, current: presetDesign("sobrio", "creator"), profile: fixtureCreator, workColors: ["#2f6a9a"], history: [], ...extra });

// Route handlers need a session: run as the demo account (owns the fixture profiles).
beforeEach(async () => {
  await loginDemo();
});

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
    const bytes = await renderDossierPdf({ profileId: DEMO_CREATOR_ID });
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

describe("the look the artist asked for in the interview", () => {
  const LOOK = "Sobrio con colores negros y blancos y que predomine el negro de fondo del dossier, con imagenes de jazz";

  it("recognises look requests and their short follow-ups, and nothing else", () => {
    const t = [
      { id: "a", text: "Hago música de Hip-hop y trabajo en solitario" },
      { id: "b", text: "Tengo dos EPs publicados" },
      { id: "c", text: LOOK },
      { id: "d", text: "oscura" },
      { id: "e", text: "el primero dolor y el segundo amor, en spotify" },
      { id: "f", text: "negro" }, // not right after a look sentence: could be anything
    ];
    expect(dossierLookRequests(t).map((s) => s.id)).toEqual(["c", "d"]);
  });

  it("never takes talk about the work, or a mention of the dossier, for a look request", () => {
    const said = [
      "Pinto retratos sobre fondo negro",
      "Compongo música de fondo para documentales",
      "En el fondo lo que quiero es grabar mi primer disco",
      "Quiero que el dossier deje claro mi proyecto",
      "Hago teatro al aire libre y necesito un dossier",
      "Necesito un dossier para enseñar mis fotos de conciertos",
      "Me lo imagino como un viaje largo, empecé en 2010",
      "El disco me lo imagino oscuro y nocturno, solo piano y contrabajo",
      "Me lo imagino como una gira por Galicia con un directo muy sobrio",
      "No tengo dossier, solo fotos en blanco y negro de mis conciertos",
    ];
    for (const text of said) expect(dossierLookRequests([{ id: "x", text }]), text).toEqual([]);
    // What artists actually answer to "¿cómo te imaginas tu dossier?", with or without saying "dossier".
    const asked = [
      "Quiero que el dossier sea oscuro",
      "Un dossier oscuro, nocturno",
      "Mi dossier lo quiero oscuro, con fondo negro",
      "Sobrio, en blanco y negro, que predomine el negro de fondo",
      "Oscuro y sobrio, con fondo negro y fotos de jazz",
      "Como un fanzine",
      "Me imagino algo sobrio, en negro",
      "Me lo imagino con mucha imagen",
      "Sobrio con colores negros y blancos", // a voice chunk...
      "y que predomine el negro de fondo del dossier", // ...and the next one
    ];
    for (const text of asked) expect(dossierLookRequests([{ id: "x", text }]), text).toHaveLength(1);
    for (const text of ["Oscura, por favor", "Sí, más oscura", "Más oscuro todavía"])
      expect(dossierLookRequests([{ id: "a", text: LOOK }, { id: "b", text }]).map((s) => s.id), text).toEqual(["a", "b"]);
    // A follow-up counts only right after a look request, only when it is a bare direction, and never chains.
    const t = [
      { id: "a", text: "Me lo imagino sobrio" },
      { id: "b", text: "Fotografío conciertos de jazz" },
      { id: "c", text: "Me lo imagino sobrio" },
      { id: "d", text: "oscura" },
      { id: "e", text: "negro" },
    ];
    expect(dossierLookRequests(t).map((s) => s.id)).toEqual(["a", "c", "d"]);
    expect(isDossierLookSentence("Pinto cuadros negros sobre lienzo")).toBe(false);
  });

  it("a black background is the page, not a black accent, and images are the artist's own", () => {
    const d = agent(`${LOOK}. oscura`);
    expect(d.palette.paper).toBe("#16191d");
    expect(d.palette.accent).not.toBe("#1a1a1a");
    expect(d.rationale).toMatch(/sube fotos/);
    expect(d.rationale.length).toBeLessThanOrEqual(600);
    expect(DossierDesign.safeParse(d).success).toBe(true);
  });

  it("the first design honours it instead of reading only the mood", async () => {
    await seedOnboardedCreator();
    await appendSegment(fixtureCreator.id, LOOK, "text");
    const first = await (await POST(req("/api/dossier/design", { body: { auto: true } }))).json();
    expect(first.design.palette.paper).toBe("#16191d");
  });

  it("the PDF designs it from the interview when the artist never opened /dossier", async () => {
    await seedOnboardedCreator();
    await appendSegment(fixtureCreator.id, LOOK, "text");
    expect((await (await GET(req("/api/dossier/design"))).json()).saved).toBe(false);
    const bytes = await renderDossierPdf({ profileId: DEMO_CREATOR_ID });
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    const now = await (await GET(req("/api/dossier/design"))).json();
    expect(now.saved).toBe(true);
    expect(now.design.palette.paper).toBe("#16191d");
  });

  it("?estilo still forces a starting point without designing anything", async () => {
    await seedOnboardedCreator();
    await appendSegment(fixtureCreator.id, LOOK, "text");
    await renderDossierPdf({ profileId: DEMO_CREATOR_ID, style: "galeria" });
    expect((await (await GET(req("/api/dossier/design"))).json()).saved).toBe(false);
  });

  it("a retried interview turn never applies the same request twice; two quick turns build on each other", async () => {
    await seedOnboardedCreator();
    await processTurn({ profileId: DEMO_CREATOR_ID, text: LOOK, source: "text" });
    await processTurn({ profileId: DEMO_CREATOR_ID, text: "oscura", source: "text" }); // before the first design has landed
    await processTurn({ profileId: DEMO_CREATOR_ID, text: "oscura", source: "text" }); // a retry of the same chunk
    await Promise.all(pendingDesigns);
    const now = await (await GET(req("/api/dossier/design"))).json();
    expect(now.history).toEqual([LOOK, "oscura"]);
    expect(now.design.palette.paper).toBe("#16191d");
  });

  it("undoing back to the start sticks: the PDF does not design one again", async () => {
    await seedOnboardedCreator();
    await appendSegment(fixtureCreator.id, LOOK, "text");
    await POST(req("/api/dossier/design", { body: { auto: true } }));
    const undone = await (await POST(req("/api/dossier/design", { body: { undo: true } }))).json();
    expect(undone.saved).toBe(false);
    await renderDossierPdf({ profileId: DEMO_CREATOR_ID });
    const now = await (await GET(req("/api/dossier/design"))).json();
    expect(now).toMatchObject({ saved: false, history: [] });
    expect(now.design.palette.paper).not.toBe("#16191d");
    const auto = await (await POST(req("/api/dossier/design", { body: { auto: true } }))).json();
    expect(auto.design.palette.paper).not.toBe("#16191d");
  });

  it("one saved design that no longer validates is dropped alone, not every artist's", async () => {
    await seedOnboardedCreator();
    await POST(req("/api/dossier/design", { body: { request: "más oscuro" } }));
    const f = path.join(dataDir(), "dossier-designs.json");
    const store = JSON.parse(fs.readFileSync(f, "utf8"));
    store.broken = { current: { name: "" } };
    fs.writeFileSync(f, JSON.stringify(store));
    const now = await (await GET(req("/api/dossier/design"))).json();
    expect(now.saved).toBe(true);
  });

  it("a fresh onboarding forgets the look of the old interview", async () => {
    await seedOnboardedCreator();
    await processTurn({ profileId: DEMO_CREATOR_ID, text: LOOK, source: "text" });
    await Promise.all(pendingDesigns);
    await processTurn({ profileId: DEMO_CREATOR_ID, text: "Soy Antía, ilustradora en A Coruña", source: "text", reset: true });
    expect((await (await GET(req("/api/dossier/design"))).json()).saved).toBe(false);
  });

  it("saying it during the interview redesigns the dossier right away", async () => {
    await seedOnboardedCreator();
    await processTurn({ profileId: DEMO_CREATOR_ID, text: LOOK, source: "text" });
    await Promise.all(pendingDesigns);
    const now = await (await GET(req("/api/dossier/design"))).json();
    expect(now.saved).toBe(true);
    expect(now.design.palette.paper).toBe("#16191d");
    expect(now.history).toEqual([LOOK]);
  });
});
