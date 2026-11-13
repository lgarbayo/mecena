import { describe, expect, it } from "vitest";
import type { Call } from "@/contracts";
import { fixtureCalls } from "@/fixtures";
import { accentFromPixels, hexToRgb, resolveStyle, styleTokens, suggestStyle, tameAccent } from "@/features/dossier/style";
import { planVariant } from "@/features/dossier/variant";

const base = structuredClone(fixtureCalls[0]);
const call = (patch: Partial<Call>): Call => ({ ...base, ...patch });

const painter = { kind: "creator" as const, disciplines: ["pintura"] };
const writer = { kind: "creator" as const, disciplines: ["narrativa"] };

describe("dossier style fit", () => {
  it("visual arts calls get the gallery look", () => {
    const s = suggestStyle({ call: call({ type: "certamen", disciplines: ["pintura", "escultura"] }), profile: writer });
    expect(s.style).toBe("galeria");
    expect(s.reason).toMatch(/artes visuales/);
  });

  it("letters, illustration and design calls get the editorial look", () => {
    expect(suggestStyle({ call: call({ type: "premio", disciplines: ["narrativa", "poesia"] }), profile: painter }).style).toBe("editorial");
    expect(suggestStyle({ call: call({ type: "certamen", disciplines: ["ilustracion", "diseno-grafico"] }) }).style).toBe("editorial");
  });

  it("public aid without a visual discipline stays sober, and so does any business", () => {
    expect(suggestStyle({ call: call({ type: "ayuda", disciplines: [] }), profile: painter }).style).toBe("sobrio");
    expect(suggestStyle({ call: call({ type: "certamen", disciplines: ["pintura"] }), profile: { kind: "business", disciplines: [] } }).style).toBe("sobrio");
  });

  it("without a call, the profile decides; the artist's choice always wins", () => {
    expect(suggestStyle({ profile: painter }).style).toBe("galeria");
    expect(suggestStyle({ profile: writer }).style).toBe("editorial");
    expect(resolveStyle({ requested: "sobrio", profile: painter })).toBe("sobrio");
    expect(resolveStyle({ requested: "neon", profile: painter })).toBe("galeria");
  });

  it("the call variant explains the suggested look in Spanish", () => {
    const plan = planVariant({ works: [], call: call({ type: "certamen", disciplines: ["fotografia"] }), profile: { ...painter } as never });
    expect(plan.variant.notes.at(-1)).toMatch(/^Estilo sugerido: «Galería», porque/);
  });
});

describe("dossier colour", () => {
  it("takes the accent from the dominant colour of the work, ignoring neutral paper", () => {
    const px: number[] = [];
    for (let i = 0; i < 400; i++) px.push(240, 238, 232, 255); // paper
    for (let i = 0; i < 120; i++) px.push(40, 90, 160, 255); // blue paint
    for (let i = 0; i < 20; i++) px.push(200, 60, 40, 255); // a little red
    const hex = accentFromPixels(px, 1)!;
    const [r, , b] = hexToRgb(hex)!;
    expect(b).toBeGreaterThan(r);
  });

  it("returns nothing for greyscale work so the style keeps its own accent", () => {
    const px: number[] = [];
    for (let i = 0; i < 500; i++) px.push(i % 255, i % 255, i % 255, 255);
    expect(accentFromPixels(px, 1)).toBeUndefined();
  });

  it("tames neon colours and builds a light wash for the call band", () => {
    const tamed = tameAccent("#00ff00")!;
    expect(tamed).not.toBe("#00ff00");
    const t = styleTokens("galeria", "creator", "#00ff00");
    expect(t.accent).toBe(tamed);
    const soft = hexToRgb(t.accentSoft)!;
    expect(Math.min(...soft)).toBeGreaterThan(170);
    expect(styleTokens("editorial", "creator").display).toBe("serif");
  });
});
