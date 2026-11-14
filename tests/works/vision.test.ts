import { beforeEach, describe, expect, it, vi } from "vitest";

const structured = vi.fn();
// A plain function (not vi.fn) for the failure path: vitest 5 reports rejected vi.fn results as test errors.
let failWith: Error | undefined;
vi.mock("@/server/ai/llm", async (orig) => ({
  ...(await orig<typeof import("@/server/ai/llm")>()),
  structured: (...a: unknown[]) => (failWith ? Promise.reject(failWith) : structured(...a)),
}));

const { worksAi, guardSheet, sanitizeCrop, DESCRIBE_WORK_SYSTEM } = await import("@/features/works/ai");
const { AiError } = await import("@/server/ai/llm");

const input = (voiceDescription?: string) => ({ kind: "creator" as const, imageBase64: "AAAA", mediaType: "image/jpeg" as const, voiceDescription });

describe("worksAi.real (Claude vision, mocked transport)", () => {
  beforeEach(() => {
    structured.mockReset();
    failWith = undefined;
  });

  it("sends the photo + voice note with the SPEC prompt on the fast tier", async () => {
    structured.mockResolvedValue({ sheet: { title: "Redeira II", technique: "acuarela sobre papel" }, crop: { x: 0.05, y: 0.08, width: 0.9, height: 0.85, rotationDeg: 1.5 }, confidence: 0.8 });
    const r = await worksAi.real.describeWork(input("Se llama Redeira II"));
    const call = structured.mock.calls[0][0];
    expect(call.tier).toBe("fast");
    expect(call.system).toBe(DESCRIBE_WORK_SYSTEM);
    expect(call.system).toContain("medidas solo si las dice");
    expect(call.user[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    expect(call.user[1].text).toContain("Redeira II");
    expect(r.crop).toEqual({ x: 0.05, y: 0.08, width: 0.9, height: 0.85, rotationDeg: 1.5 });
    expect(r.sheet.title).toBe("Redeira II");
  });

  it("drops measures, year and series the artist never said (no hallucinations)", async () => {
    structured.mockResolvedValue({ sheet: { title: "Marina", year: 2021, dimensions: "50 x 70 cm", series: "Costas", technique: "óleo sobre lienzo" }, crop: { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 }, confidence: 0.7 });
    const r = await worksAi.real.describeWork(input("Es un óleo de mi pueblo"));
    expect(r.sheet.dimensions).toBeUndefined();
    expect(r.sheet.year).toBeUndefined();
    expect(r.sheet.series).toBeUndefined();
    expect(r.sheet.technique).toBe("óleo sobre lienzo");
  });

  it("the artist's words win over the model", async () => {
    structured.mockResolvedValue({ sheet: { title: "Red", dimensions: "40 x 60 cm" }, crop: { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 }, confidence: 0.7 });
    const r = await worksAi.real.describeWork(input("Se llama Redeira II, 50 por 70"));
    expect(r.sheet.title).toBe("Redeira II");
    expect(r.sheet.dimensions).toBe("50 x 70 cm");
  });

  it("on AiError: sheet from the voice only, whole photo, and flagged so the UI can say so", async () => {
    failWith = new AiError("nope", "refusal");
    const r = await worksAi.real.describeWork(input("Se llama Redeira II, acuarela sobre papel de 2025, 50 por 70, de la serie Redeiras"));
    expect(r.sheet).toMatchObject({ title: "Redeira II", year: 2025, dimensions: "50 x 70 cm", series: "Redeiras" });
    // Never the mock's example crop: a failed reading must not pretend to have framed the work.
    expect(r.crop).toEqual({ x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 });
    expect(r.fallback).toBe(true);
  });

  it("without a voice note, title and concept are never taken from the model (no invention)", async () => {
    structured.mockResolvedValue({ sheet: { title: "Atardecer en la ría", concept: "Una reflexión sobre el paso del tiempo.", technique: "óleo sobre lienzo" }, crop: { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 }, confidence: 0.6 });
    const r = await worksAi.real.describeWork(input());
    expect(r.sheet.title).toBe("Sin título");
    expect(r.sheet.concept).toBeUndefined();
    expect(r.sheet.technique).toBe("óleo sobre lienzo"); // evident from the image: allowed
  });

  it("with a note, a title the artist never said is dropped; a title they said is kept", async () => {
    structured.mockResolvedValue({ sheet: { title: "Marea alta", concept: "Habla de mi abuela." }, crop: { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 }, confidence: 0.6 });
    const invented = await worksAi.real.describeWork(input("Es un óleo que habla de mi abuela"));
    expect(invented.sheet.title).toBe("Sin título");
    expect(invented.sheet.concept).toBe("Habla de mi abuela.");
    structured.mockResolvedValue({ sheet: { title: "Marea Alta" }, crop: { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 }, confidence: 0.6 });
    expect((await worksAi.real.describeWork(input("esta es marea alta, de la serie Costas"))).sheet.title).toBe("Marea Alta");
  });

  it("sanitizes crops: out-of-bounds clamped, tiny or wild crops become identity", () => {
    expect(sanitizeCrop({ x: 0.1, y: 0.1, width: 0.95, height: 0.95, rotationDeg: 30 })).toEqual({ x: 0.1, y: 0.1, width: 0.9, height: 0.9, rotationDeg: 10 });
    expect(sanitizeCrop({ x: 0.4, y: 0.4, width: 0.2, height: 0.2, rotationDeg: 0 })).toEqual({ x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 });
    expect(sanitizeCrop(undefined)).toEqual({ x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 });
  });

  it("guardSheet keeps a year the artist said even if the parser missed the phrasing", () => {
    expect(guardSheet({ title: "X", year: 2019 }, "la pinté allá por 2019").year).toBe(2019);
    expect(guardSheet({ title: "" }, undefined).title).toBe("Sin título");
  });
});
