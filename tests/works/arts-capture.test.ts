import { describe, expect, it, beforeEach } from "vitest";
import { POST as createRoute } from "@/app/api/works/route";
import { PATCH as patchRoute } from "@/app/api/works/[id]/route";
import { POST as describeRoute } from "@/app/api/works/[id]/describe/route";
import type { Work } from "@/contracts";
import { fixtureCreator } from "@/fixtures";
import { worksAi, guardSheet } from "@/features/works/ai";
import { ART_COPY } from "@/features/works/arts";
import { inferMediaKind, normalizeLink, normalizeLinks } from "@/features/works/links";
import { extractLinks, parseVoiceSheet } from "@/features/works/parse";
import { saveProfile } from "@/server/store";
import { ctx, req, loginDemo } from "../helpers";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = `data:image/png;base64,${PNG_B64}`;

const describe$ = (voiceDescription: string) => worksAi.mock.describeWork({ kind: "creator", imageBase64: PNG_B64, mediaType: "image/png", voiceDescription });

async function asArtist(disciplines: string[]) {
  await saveProfile({ ...structuredClone(fixtureCreator), disciplines });
}

async function create(body: Record<string, unknown>): Promise<Work> {
  const r = await createRoute(req("/api/works", { body: { imageDataUrl: PNG, ...body } }));
  expect(r.status).toBe(201);
  return (await r.json()).work;
}

// Route handlers need a session: run as the demo account (owns the fixture profiles).
beforeEach(async () => {
  await loginDemo();
});

describe("voice -> sheet for every art (CCR-arts)", () => {
  it("music: the demo sentence", async () => {
    const r = await describe$("Nana para Lúa, 2024, cuarteto de cuerda, 6 minutos, estrenada en el Auditorio de Galicia");
    expect(r.sheet).toEqual({ title: "Nana para Lúa", year: 2024, technique: "cuarteto de cuerda", duration: "6 min", venue: "Auditorio de Galicia" });
  });

  it("music: line-up and mm:ss duration", () => {
    expect(parseVoiceSheet("Se llama Brétema, canción de 2023, 3:45, interpretada por Sés y Ana Lúa")).toMatchObject({
      title: "Brétema",
      year: 2023,
      technique: "canción",
      duration: "3:45",
      credits: "Sés y Ana Lúa",
    });
  });

  it("dance: discipline, duration, premiere and company; the theatre name is not the technique", async () => {
    const r = await describe$("Raíz, danza contemporánea, 45 minutos, estrenada en el Teatro Rosalía de Castro con la compañía Nordés. Habla de las raíces que nos atan a la tierra.");
    expect(r.sheet).toMatchObject({
      title: "Raíz",
      technique: "danza contemporánea",
      duration: "45 min",
      venue: "Teatro Rosalía de Castro",
      credits: "Compañía Nordés",
      concept: "Habla de las raíces que nos atan a la tierra.",
    });
    expect(parseVoiceSheet("Vía Láctea, estrenada en el Teatro Principal en 2022, hora y media").technique).toBeUndefined();
  });

  it("literature: genre, publisher, pages", async () => {
    const r = await describe$("Se titula Mar de fondo, novela, publicada por Editorial Galaxia en 2023, 240 páginas");
    expect(r.sheet).toEqual({ title: "Mar de fondo", year: 2023, technique: "novela", credits: "Editorial Galaxia", dimensions: "240 páginas" });
  });

  it("audiovisual: format, duration and festival; links typed in the note are pulled out", () => {
    const v = "Se llama Faro, cortometraje documental de 2021, 12 min, proyectado en el Festival de Cans. https://vimeo.com/123";
    expect(parseVoiceSheet(v)).toMatchObject({ title: "Faro", technique: "cortometraje documental", duration: "12 min", venue: "Festival de Cans", year: 2021 });
    expect(extractLinks(v)).toEqual(["https://vimeo.com/123"]);
  });

  it("a plain sentence is still not a title, and painting still works", () => {
    expect(parseVoiceSheet("Es un retrato de mi abuela en el puerto").title).toBeUndefined();
    expect(parseVoiceSheet("Redeira III, acuarela sobre papel, 2025, 50 por 70")).toMatchObject({ title: "Redeira III", technique: "acuarela sobre papel", dimensions: "50 x 70 cm" });
  });

  it("the vision guard drops duration/credits/venue the artist never said", () => {
    const sheet = guardSheet({ title: "X", duration: "5 min", credits: "Orquesta inventada", venue: "Teatro Real" }, "Una pieza sobre el mar");
    expect(sheet.duration).toBeUndefined();
    expect(sheet.credits).toBeUndefined();
    expect(sheet.venue).toBeUndefined();
    const kept = guardSheet({ title: "X", duration: "6 min", credits: "Cuarteto Vigo", venue: "Auditorio de Galicia" }, "dura seis minutos, la toca el cuarteto Vigo en el auditorio de galicia");
    expect(kept).toMatchObject({ duration: "6 min", credits: "Cuarteto Vigo", venue: "Auditorio de Galicia" });
  });
});

describe("links and media kind", () => {
  it("validates and normalises links", () => {
    expect(normalizeLink("bandcamp.com/album/nana")).toBe("https://bandcamp.com/album/nana");
    expect(normalizeLink("javascript:alert(1)")).toBeUndefined();
    expect(normalizeLink("no es un enlace")).toBeUndefined();
    expect(normalizeLink("hola")).toBeUndefined();
    expect(normalizeLinks(["https://youtu.be/a", "https://youtu.be/a", "mal"])).toEqual(["https://youtu.be/a"]);
  });

  it("infers media kind: explicit > link > art family", () => {
    expect(inferMediaKind({ explicit: "text", links: ["https://youtu.be/a"] })).toBe("text");
    expect(inferMediaKind({ links: ["https://soundcloud.com/a/b"], profile: { kind: "creator", disciplines: ["pintura"] } })).toBe("audio");
    expect(inferMediaKind({ profile: { kind: "creator", disciplines: ["bailarina"] } })).toBe("performance");
    expect(inferMediaKind({ profile: { kind: "creator", disciplines: ["poeta"] } })).toBe("text");
    expect(inferMediaKind({ profile: { kind: "business", disciplines: ["poeta"] } })).toBe("image");
  });

  it("copy adapts the sheet labels to the art", () => {
    const labels = (f: keyof typeof ART_COPY) => ART_COPY[f].fields.map((x) => x.label);
    expect(labels("artes-visuales")).toEqual(expect.arrayContaining(["Técnica", "Medidas"]));
    expect(labels("musica")).toEqual(expect.arrayContaining(["Formación", "Duración"]));
    expect(labels("artes-escenicas")).toEqual(expect.arrayContaining(["Disciplina", "Duración", "Estreno"]));
    expect(labels("audiovisual")).toEqual(expect.arrayContaining(["Formato", "Duración", "Equipo"]));
    expect(labels("literatura")).toEqual(expect.arrayContaining(["Género", "Editorial", "Páginas"]));
    expect(ART_COPY.musica.captureLead).toContain("concierto");
    expect(ART_COPY.literatura.captureLead).toContain("cubierta");
  });
});

describe("/api/works for every art", () => {
  it("music: a musician's work is audio by default and keeps the Bandcamp link", async () => {
    await asArtist(["pianista"]);
    const w = await create({ voiceDescription: "Nana para Lúa, 2024, cuarteto de cuerda, 6 minutos, estrenada en el Auditorio de Galicia", links: ["https://lua.bandcamp.com/track/nana"] });
    expect(w.mediaKind).toBe("audio");
    expect(w.links).toEqual(["https://lua.bandcamp.com/track/nana"]);
    expect(w.sheet).toMatchObject({ title: "Nana para Lúa", duration: "6 min", venue: "Auditorio de Galicia" });
  });

  it("dance: performance by default; adding a YouTube link makes it video; explicit kind wins", async () => {
    await asArtist(["bailarina"]);
    const w = await create({});
    expect(w.mediaKind).toBe("performance");
    expect(w.links).toEqual([]);
    const r = await patchRoute(req(`/api/works/${w.id}`, { method: "PATCH", body: { links: ["https://www.youtube.com/watch?v=raiz"] } }), ctx({ id: w.id }));
    const updated: Work = (await r.json()).work;
    expect(updated.mediaKind).toBe("video");
    const r2 = await patchRoute(req(`/api/works/${w.id}`, { method: "PATCH", body: { mediaKind: "performance", links: [...updated.links!, "https://vimeo.com/1"] } }), ctx({ id: w.id }));
    expect((await r2.json()).work.mediaKind).toBe("performance");
  });

  it("dance: the note dictated while uploading fills the performing-arts fields", async () => {
    await asArtist(["danza contemporánea"]);
    const w = await create({});
    const r = await describeRoute(
      req(`/api/works/${w.id}/describe`, { body: { voiceDescription: "Raíz, danza contemporánea, 45 minutos, estrenada en el Teatro Rosalía de Castro con la compañía Nordés" } }),
      ctx({ id: w.id }),
    );
    const d: Work = (await r.json()).work;
    expect(d.sheet).toMatchObject({ title: "Raíz", duration: "45 min", venue: "Teatro Rosalía de Castro", credits: "Compañía Nordés" });
    expect(d.mediaKind).toBe("performance");
  });

  it("literature: text by default; clearing a field removes it; invalid links are rejected", async () => {
    await asArtist(["escritora", "poeta"]);
    const w = await create({ voiceDescription: "Se titula Mar de fondo, novela, publicada por Editorial Galaxia en 2023, 240 páginas" });
    expect(w.mediaKind).toBe("text");
    expect(w.sheet.credits).toBe("Editorial Galaxia");
    const r = await patchRoute(req(`/api/works/${w.id}`, { method: "PATCH", body: { sheet: { credits: "" } } }), ctx({ id: w.id }));
    expect((await r.json()).work.sheet.credits).toBeUndefined();
    const bad = await patchRoute(req(`/api/works/${w.id}`, { method: "PATCH", body: { links: ["no es un enlace"] } }), ctx({ id: w.id }));
    expect(bad.status).toBe(400);
  });

  it("visual arts unchanged: a painter's work is an image", async () => {
    await asArtist(["pintura"]);
    expect((await create({ voiceDescription: "Se llama Redeira II, acuarela sobre papel de 2025" })).mediaKind).toBe("image");
  });
});
