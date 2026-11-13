/** Their words, without their typos: lexical clean-up of what the person says or types before it lands in the dossier. */
import { describe, expect, it } from "vitest";
import type { DossierSection, TranscriptSegment } from "@/contracts";
import { blankCreator, fixtureCalls, fixtureCreator, FIXTURE_NOW } from "@/fixtures";
import { fixWording, polishProse, WORDING_RULE } from "@/server/ai/wording";
import { mockOnboardingTurn } from "@/features/onboarding/mock";
import { toTurnResult } from "@/features/onboarding/ai";
import { systemPrompt } from "@/features/onboarding/prompt";
import { draftingAi } from "@/features/drafting/ai";

const seg = (id: string, text: string, source: "voice" | "text" = "text"): TranscriptSegment => ({ id, text, source, at: FIXTURE_NOW });

describe("fixWording", () => {
  it.each([
    ["tambien hago fotografia y ceramica", "también hago fotografía y cerámica"],
    ["una exposicion de ilustracion", "una exposición de ilustración"],
    ["q quiero hacerlo xq tb me gusta", "que quiero hacerlo porque también me gusta"],
    ["tb también lo hago", "también lo hago"],
    ["soy ilustradora de de Malpica", "soy ilustradora de Malpica"],
    ["un oleo sobre lienzo ,y acuarela", "un óleo sobre lienzo, y acuarela"],
    ["acuarela,tinta y papel", "acuarela, tinta y papel"],
    ["TAMBIEN", "TAMBIÉN"],
  ])("%s → %s", (input, expected) => {
    expect(fixWording(input)).toBe(expected);
  });

  it.each([
    "Me mudé a A Coruña en 2019.", // "a A" is not a stutter
    "Mide 50 x 70 cm y la beca da 2,5 meses.", // decimals and measures
    "Expuse en la Galeria Senda de Barcelona.", // proper name mid-sentence keeps its spelling
    "Mi web es www.fotografia-antia.com, escríbeme a antia@galeria.gal o en @antia_fotografia.", // links, emails, handles
    "- 2024 Exposición colectiva. Museo de Bellas Artes\n- 2023 Premio de ilustración", // bullets and line breaks
    "Pinto a las rederas y mariscadoras de mi familia porque son la memoria de la costa.", // already correct
    "Despois da exposición volvín a Vigo.", // Galician left as is
    "Espera... ya lo tengo.",
    // Galician is corrected by Claude, never castellanised here.
    "Levo 15 anos pintando o mar. Este ano expuxen en Vigo e cada ano volvo.",
    "Os meus pais eran mariscadores.",
    // Spanish homographs and legit repeats.
    "Actualmente ultima su nueva serie. Ultimo los detalles.",
    "El tren no para para nada. Lo que es es una pregunta.",
    // Units, acronyms and capitals: shorthand is lowercase-only and never after a number.
    "Necesito un disco de 2 TB y 1 tb más. Hicimos un Q&A.",
    // Bare domains, paths, hashtags, snake_case.
    "Web: antia-ilustracion.com, instagram.com/ana_fotografia y #ceramica, behance.net/ana-galeria",
    // Names and titles at a line or sentence start.
    "- 2021 Exposición colectiva. Galeria Joan Prats, Barcelona\n- 2020 Interaccion Studio, Madrid",
    // Indentation of nested bullets.
    "- uno\n    - dos",
  ])("leaves %j alone", (text) => {
    expect(fixWording(text)).toBe(text);
  });

  it("is idempotent", () => {
    const messy = "q q tambien expuse en la galeria,y hace dos anos gane un premio de de ilustracion .";
    expect(fixWording(fixWording(messy))).toBe(fixWording(messy));
    expect(polishProse(polishProse(messy))).toBe(polishProse(messy));
  });
});

describe("polishProse", () => {
  it("capitalises sentences but not after abbreviations", () => {
    expect(polishProse("me interesa el mar. tambien la costa, p. ej. las rederas")).toBe("Me interesa el mar. También la costa, p. ej. las rederas");
    expect(polishProse("¿y por qué no? porque sí")).toBe("¿Y por qué no? Porque sí");
    expect(polishProse("somos una S.L. y queremos crecer")).toBe("Somos una S.L. y queremos crecer");
    expect(polishProse("por María J. de Castro")).toBe("Por María J. de Castro");
    expect(polishProse("pinto... y luego espero")).toBe("Pinto... y luego espero");
    expect(polishProse("www.antia.gal es mi web. instagram.com/antia también")).toBe("www.antia.gal es mi web. instagram.com/antia también");
  });

  it("stays linear on hostile input", () => {
    const t0 = performance.now();
    polishProse("a@".repeat(3000) + "@".repeat(3000) + " tambien");
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("onboarding writes the dossier without the typos", () => {
  it("prompt tells Claude to fix form, never substance", () => {
    const sys = systemPrompt("creator");
    expect(sys).toContain(WORDING_RULE);
    expect(sys).not.toMatch(/tal cual/);
  });

  it("deterministic turn (mock / fallback): sections and profile fields come out corrected", () => {
    const newSegment = seg("s1", "me llamo Antía Varela y soy ilustradora de A Coruña. tambien pinto acuarelas de de las rederas porque me interesa la memoria. expuse en el museo de Vigo en la galeria municipal. quiero hacer una exposicion de ilustracion");
    const r = mockOnboardingTurn({ kind: "creator", profile: blankCreator, sections: [], transcript: [newSegment], newSegment });
    const all = r.sectionUpdates.map((s) => s.body).join("\n");
    expect(all).toMatch(/También pinto acuarelas de las rederas/);
    expect(all).toMatch(/galería municipal/);
    expect(all).toMatch(/exposición de ilustración/);
    expect(all).not.toMatch(/tambien|galeria|exposicion|de de/);
    expect(r.profilePatch.achievements?.[0]).toBe("Expuse en el museo de Vigo en la galería municipal");
    expect(r.profilePatch.fundingNeeds?.[0]).toBe("hacer una exposición de ilustración");
    for (const s of r.sectionUpdates) expect(s.sourceSegmentIds).toEqual(["s1"]);
  });

  it("Claude's output is kept as Claude corrected it (no context-free rewrite on top: Galician stays Galician)", () => {
    const newSegment = seg("s1", "levo 15 anos pintando o mar cos meus pais");
    const input = { kind: "creator" as const, profile: blankCreator, sections: [] as DossierSection[], transcript: [newSegment], newSegment };
    const r = toTurnResult(input, {
      profilePatch: {},
      sectionUpdates: [{ key: "bio", body: "Levo 15 anos pintando o mar cos meus pais.", sourceSegmentIds: ["s1"] }],
      followUpQuestion: "¿Dónde vives?",
    });
    expect(r.sectionUpdates[0].body).toBe("Levo 15 anos pintando o mar cos meus pais.");
  });

  it("the fundingNeeds backstop reads Claude's corrected text, not the raw segment with its typos", () => {
    const prev: DossierSection = { key: "series", title: "Series", body: "Pinto a las rederas.", sourceSegmentIds: ["s0"], status: "draft", updatedAt: FIXTURE_NOW };
    const newSegment = seg("s1", "y quiero aser una serie echa con a cuarelas", "voice");
    const input = { kind: "creator" as const, profile: blankCreator, sections: [prev], transcript: [newSegment], newSegment };
    const r = toTurnResult(input, {
      profilePatch: {},
      sectionUpdates: [{ key: "series", body: "Pinto a las rederas.\n\nQuiero hacer una serie hecha con acuarelas.", sourceSegmentIds: ["s0", "s1"] }],
      followUpQuestion: "¿Dónde vives?",
    });
    expect(r.profilePatch.fundingNeeds).toEqual(["hacer una serie hecha con acuarelas"]);
  });

  it("the transcript (provenance) is never rewritten", () => {
    const newSegment = seg("s1", "tambien hago ceramica");
    mockOnboardingTurn({ kind: "creator", profile: blankCreator, sections: [], transcript: [newSegment], newSegment });
    expect(newSegment.text).toBe("tambien hago ceramica");
  });
});

describe("drafting quotes the user's words without their typos", () => {
  it("mock draft polishes quoted segments", async () => {
    const beca = fixtureCalls.find((c) => c.id === "fixture-beca-artes-plasticas")!;
    const transcript = [seg("t1", "quiero hacer una serie de acuarelas sobre la conserva tambien en Malpica"), seg("t2", "pinto porque me interesa la memoria de de la costa")];
    const d = await draftingAi.mock.draftApplication({ profile: fixtureCreator, call: beca, transcript, works: [] });
    const body = d.sections.map((s) => s.body).join("\n");
    expect(body).toMatch(/Quiero hacer una serie de acuarelas sobre la conserva también en Malpica/);
    expect(body).toMatch(/Pinto porque me interesa la memoria de la costa/);
  });
});
