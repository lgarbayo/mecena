import { describe, expect, it } from "vitest";
import { worksAi } from "@/features/works/ai";
import { mentionsDimensions, parseVoiceSheet, sheetFromVoice } from "@/features/works/parse";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const describe$ = (voiceDescription?: string) => worksAi.mock.describeWork({ kind: "creator", imageBase64: PNG, mediaType: "image/png", voiceDescription });

describe("worksAi.mock (voice -> technical sheet)", () => {
  it("parses the demo sentence into a full sheet", async () => {
    const r = await describe$("Se llama Redeira II, acuarela sobre papel de 2025, 50 por 70, de la serie Redeiras");
    expect(r.sheet.title).toBe("Redeira II");
    expect(r.sheet.year).toBe(2025);
    expect(r.sheet.technique).toContain("acuarela");
    expect(r.sheet.technique).toBe("acuarela sobre papel");
    expect(r.sheet.dimensions).toBe("50 x 70 cm");
    expect(r.sheet.series).toBe("Redeiras");
    expect(r.crop).toEqual({ x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 });
  });

  it("never invents fields the artist did not say", async () => {
    const r = await describe$("Es un retrato de mi abuela en el puerto");
    expect(r.sheet.title).toBe("Sin título");
    expect(r.sheet.year).toBeUndefined();
    expect(r.sheet.dimensions).toBeUndefined();
    expect(r.sheet.series).toBeUndefined();
    expect(r.sheet.technique).toBeUndefined();
    expect(r.sheet.concept).toBe("Es un retrato de mi abuela en el puerto.");
  });

  it("handles no voice at all", async () => {
    const r = await describe$(undefined);
    expect(r.sheet).toEqual({ title: "Sin título" });
    expect(r.confidence).toBeLessThan(0.5);
  });

  it.each([
    ["Óleo sobre lienzo, 100 x 81 cm, del año 2019", { technique: "óleo sobre lienzo", dimensions: "100 x 81 cm", year: 2019 }],
    ["La he titulado «Marea baja». Tinta china, 30 por 40 centímetros", { title: "Marea baja", technique: "tinta china", dimensions: "30 x 40 cm" }],
    ["Se titula Faro. Grabado de 2023, 20x30x5 mm", { title: "Faro", technique: "grabado", dimensions: "20 x 30 x 5 mm", year: 2023 }],
    ["Pertenece a la serie Mareas vivas. Habla de lo que el mar se lleva y devuelve.", { series: "Mareas vivas", concept: "Habla de lo que el mar se lleva y devuelve." }],
    ["Se llama Nordés y es tinta y acuarela sobre papel", { title: "Nordés", technique: "tinta y acuarela sobre papel" }],
    ["Una fotografía de 2024, 1,5 por 2 metros", { technique: "fotografía", year: 2024, dimensions: "1,5 x 2 m" }],
  ])("parses %s", (voice, expected) => {
    expect(parseVoiceSheet(voice)).toMatchObject(expected);
  });

  it("does not read measures as a year", () => {
    expect(parseVoiceSheet("mide 2000 x 1500 mm").year).toBeUndefined();
    expect(parseVoiceSheet("mide 2000 x 1500 mm").dimensions).toBe("2000 x 1500 mm");
  });

  it("sheetFromVoice always has a title; mentionsDimensions detects measure talk", () => {
    expect(sheetFromVoice("").title).toBe("Sin título");
    expect(mentionsDimensions("50 por 70")).toBe(true);
    expect(mentionsDimensions("mide un metro")).toBe(true);
    expect(mentionsDimensions("acuarela de 2025")).toBe(false);
  });
});
