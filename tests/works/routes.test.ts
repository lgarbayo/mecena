import fs from "node:fs";
import { describe, expect, it, beforeEach } from "vitest";
import { GET as listRoute, POST as createRoute } from "@/app/api/works/route";
import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute } from "@/app/api/works/[id]/route";
import { GET as imageRoute } from "@/app/api/works/[id]/image/route";
import { POST as describeRoute } from "@/app/api/works/[id]/describe/route";
import { POST as moveRoute } from "@/app/api/works/[id]/move/route";
import type { Work } from "@/contracts";
import { ctx, req, loginDemo } from "../helpers";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = `data:image/png;base64,${PNG_B64}`;

async function create(voiceDescription?: string): Promise<Work> {
  const r = await createRoute(req("/api/works", { body: { imageDataUrl: PNG, voiceDescription } }));
  expect(r.status).toBe(201);
  return (await r.json()).work;
}

// Route handlers need a session: run as the demo account (owns the fixture profiles).
beforeEach(async () => {
  await loginDemo();
});

describe("/api/works", () => {
  it("POST a tiny PNG -> 201 with imageUrl, sheet from the voice note", async () => {
    const work = await create("Se llama Redeira II, acuarela sobre papel de 2025, 50 por 70, de la serie Redeiras");
    expect(work.imageUrl).toBe(`/api/works/${work.id}/image`);
    expect(work.sheet).toMatchObject({ title: "Redeira II", year: 2025, dimensions: "50 x 70 cm", series: "Redeiras" });
    expect(work.sheetSource).toBe("voice");
    expect(work.confirmed).toBe(false);
    expect(work.order).toBe(0);
  });

  it("GET image returns the exact uploaded bytes with the right content-type (never altered)", async () => {
    const work = await create();
    const r = await imageRoute(req(work.imageUrl), ctx({ id: work.id }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(PNG_B64, "base64"))).toBe(true);
  });

  it("PATCH updates sheet fields, confirmed and order", async () => {
    const work = await create("Se llama Faro");
    const r = await patchRoute(req(`/api/works/${work.id}`, { method: "PATCH", body: { sheet: { title: "Faro de Hércules", dimensions: "30 x 40 cm" }, order: 5, confirmed: true } }), ctx({ id: work.id }));
    expect(r.status).toBe(200);
    const updated: Work = (await r.json()).work;
    expect(updated.sheet).toMatchObject({ title: "Faro de Hércules", dimensions: "30 x 40 cm" });
    expect(updated.order).toBe(5);
    expect(updated.confirmed).toBe(true);
    expect(updated.sheetSource).toBe("manual");
    const again = await (await getRoute(req(`/api/works/${work.id}`), ctx({ id: work.id }))).json();
    expect(again.work.order).toBe(5);
  });

  it("PATCH with an empty field clears it; empty title falls back to 'Sin título'", async () => {
    const work = await create("Se llama Faro, 30 por 40");
    const updated: Work = (await (await patchRoute(req(`/api/works/${work.id}`, { method: "PATCH", body: { sheet: { title: "  ", dimensions: "" } } }), ctx({ id: work.id }))).json()).work;
    expect(updated.sheet.title).toBe("Sin título");
    expect(updated.sheet.dimensions).toBeUndefined();
  });

  it("POST describe fills the sheet from a note dictated after the upload", async () => {
    const work = await create();
    expect(work.sheet.title).toBe("Sin título");
    const r = await describeRoute(req(`/api/works/${work.id}/describe`, { body: { voiceDescription: "Se titula Nordés, óleo sobre lienzo de 2024" } }), ctx({ id: work.id }));
    expect(r.status).toBe(200);
    const w: Work = (await r.json()).work;
    expect(w.sheet).toMatchObject({ title: "Nordés", technique: "óleo sobre lienzo", year: 2024 });
    expect(w.sheetSource).toBe("voice");
  });

  it("POST describe keeps what the artist typed by hand unless the note says otherwise", async () => {
    const work = await create();
    await patchRoute(req(`/api/works/${work.id}`, { method: "PATCH", body: { sheet: { title: "Mi título", dimensions: "20 x 20 cm" } } }), ctx({ id: work.id }));
    const w: Work = (await (await describeRoute(req(`/api/works/${work.id}/describe`, { body: { voiceDescription: "Es tinta sobre papel de 2023" } }), ctx({ id: work.id }))).json()).work;
    expect(w.sheet).toMatchObject({ title: "Mi título", dimensions: "20 x 20 cm", technique: "tinta sobre papel", year: 2023 });
  });

  it("move up/down persists order for every work", async () => {
    const a = await create("Se llama A");
    const b = await create("Se llama B");
    const c = await create("Se llama C");
    expect([a.order, b.order, c.order]).toEqual([0, 1, 2]);
    const r = await moveRoute(req(`/api/works/${c.id}/move`, { body: { direction: -1 } }), ctx({ id: c.id }));
    expect(r.status).toBe(200);
    const list: Work[] = (await (await listRoute(req("/api/works"))).json()).works;
    expect(list.map((w) => w.sheet.title)).toEqual(["A", "C", "B"]);
    // Moving the first one up is a no-op.
    await moveRoute(req(`/api/works/${a.id}/move`, { body: { direction: -1 } }), ctx({ id: a.id }));
    const list2: Work[] = (await (await listRoute(req("/api/works"))).json()).works;
    expect(list2.map((w) => [w.sheet.title, w.order])).toEqual([["A", 0], ["C", 1], ["B", 2]]);
  });

  it("DELETE removes the work and its photo, renumbering the rest", async () => {
    const a = await create("Se llama A");
    const b = await create("Se llama B");
    expect((await deleteRoute(req(`/api/works/${a.id}`, { method: "DELETE" }), ctx({ id: a.id }))).status).toBe(200);
    expect((await getRoute(req(`/api/works/${a.id}`), ctx({ id: a.id }))).status).toBe(404);
    expect((await imageRoute(req(a.imageUrl), ctx({ id: a.id }))).status).toBe(404);
    const list: Work[] = (await (await listRoute(req("/api/works"))).json()).works;
    expect(list.map((w) => [w.id, w.order])).toEqual([[b.id, 0]]);
  });

  it("rejects non-image data URLs with 400 and unknown ids with 404", async () => {
    expect((await createRoute(req("/api/works", { body: { imageDataUrl: "data:image/gif;base64,R0lGOD" } }))).status).toBe(400);
    expect((await createRoute(req("/api/works", { body: { imageDataUrl: "http://x" } }))).status).toBe(400);
    expect((await getRoute(req("/api/works/nope"), ctx({ id: "nope" }))).status).toBe(404);
    expect((await imageRoute(req("/api/works/nope/image"), ctx({ id: "nope" }))).status).toBe(404);
  });

  it("works in business mode (product photos) too", async () => {
    const { POST: setMode } = await import("@/app/api/profile/mode/route");
    await setMode(req("/api/profile/mode", { body: { kind: "business" } }));
    const w = await create("Se llama Taza Mar, cerámica, 10 por 8");
    expect(w.sheet).toMatchObject({ title: "Taza Mar", technique: "cerámica", dimensions: "10 x 8 cm" });
    expect(fs.existsSync).toBeDefined();
  });
});
