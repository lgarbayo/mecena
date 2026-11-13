import { describe, expect, it } from "vitest";
import type { Call, Work } from "@/contracts";
import { DEMO_CREATOR_ID, FIXTURE_NOW, fixtureCalls, fixtureCreator } from "@/fixtures";
import { mockDesign } from "@/features/dossier/ai";
import { familyOf, linkLabel } from "@/features/dossier/arts";
import { guardDesign, presetDesign } from "@/features/dossier/design";
import { classifyAchievement, toCreatorView } from "@/features/dossier/model";
import { planCreator } from "@/features/dossier/structure";

const work = (id: string, sheet: Record<string, unknown>, extra: Record<string, unknown> = {}): Work =>
  ({
    id,
    profileId: DEMO_CREATOR_ID,
    imageUrl: `/demo/${id}.jpg`,
    sheet: { title: id, ...sheet },
    sheetSource: "voice",
    confirmed: true,
    order: 0,
    createdAt: FIXTURE_NOW,
    ...extra,
  }) as Work;

const viewFor = (disciplines: string[], works: Work[] = [], achievements: string[] = []) =>
  toCreatorView({
    profile: { ...fixtureCreator, disciplines, achievements },
    dossier: { profileId: DEMO_CREATOR_ID, kind: "creator", sections: [], workIds: works.map((w) => w.id), generatedAt: FIXTURE_NOW },
    works,
  });

describe("every art, not only painting", () => {
  it("knows the family of any discipline", () => {
    expect(familyOf(["pintura"])).toBe("artes-visuales");
    expect(familyOf(["pianista", "composición"])).toBe("musica");
    expect(familyOf(["danza contemporánea"])).toBe("artes-escenicas");
    expect(familyOf(["cine documental"])).toBe("audiovisual");
    expect(familyOf(["poesía"])).toBe("literatura");
    expect(familyOf([])).toBe("artes-visuales");
  });

  it("speaks the language of music: repertoire, duration, credits, a link to listen", () => {
    const v = viewFor(["música", "violonchelo"], [
      work("nana", { year: 2024, technique: "Cuarteto de cuerda", duration: "6 min", credits: "Cuarteto Brétema", venue: "Estreno en el Auditorio de Galicia", series: "Nanas" }, { mediaKind: "audio", links: ["https://bandcamp.com/nana"] }),
    ], ["Concierto en el Auditorio de Galicia (2024)", "Disco 'Brétema' (2023)", "Gira por Portugal (2025)"]);
    expect(v.family).toBe("musica");
    const w = v.series[0].works[0];
    expect(w).toMatchObject({ duration: "6 min", credits: "Cuarteto Brétema", mediaKind: "audio", links: ["https://bandcamp.com/nana"] });
    expect(linkLabel(w.links[0])).toBe("Escuchar");
    expect(v.cv.map((g) => g.title)).toEqual(expect.arrayContaining(["Conciertos y giras", "Colaboraciones", "Discografía"]));
    expect(planCreator(v).blocks.find((b) => b.kind === "works")?.title).toBe("Repertorio");
  });

  it("names the works of a dancer and a writer in their own terms", () => {
    expect(planCreator(viewFor(["danza"])).blocks.find((b) => b.kind === "works")?.title).toBe("Piezas");
    expect(planCreator(viewFor(["narrativa"])).blocks.find((b) => b.kind === "works")?.title).toBe("Publicaciones");
    expect(classifyAchievement("Estreno de 'Raíz' en el Teatro Rosalía (2024)")).toBe("soloShows");
    expect(classifyAchievement("Novela publicada por Galaxia (2022)")).toBe("collections");
  });

  it("still reads works saved before CCR-arts (no duration, no links)", () => {
    const v = viewFor(["pintura"], [work("old", { technique: "óleo", dimensions: "50 x 70 cm" })]);
    expect(v.series[0].works[0]).toMatchObject({ size: "50 × 70 cm", duration: "", links: [], mediaKind: "image" });
  });
});

describe("the artist decides the structure", () => {
  const agent = (request: string, interview: string[] = [], call?: Call) =>
    mockDesign({ request, current: presetDesign("sobrio", "creator"), profile: fixtureCreator, workColors: [], history: [], interview, call });

  it("short version, no bio, CV first", () => {
    const d = agent("quiero algo breve, sin biografía y con la trayectoria primero");
    expect(d.structure.length).toBe("breve");
    expect(d.structure.blocks.map((b) => b.key)).toEqual(["cv", "statement", "works"]);
    const v = viewFor(["pintura"], [1, 2, 3, 4, 5, 6].map((i) => work(`w${i}`, { series: "S" })));
    const plan = planCreator(v, d);
    expect(plan.blocks.map((b) => b.kind)).toEqual(["cv", "statement", "works"]);
    expect(plan.view.series.flatMap((s) => s.works)).toHaveLength(4);
  });

  it("adds a section of their own only from what they said", () => {
    const d = agent("añade una sección sobre mi proceso", ["Mi proceso empieza caminando por la Ribeira Sacra con un cuaderno."]);
    const custom = d.structure.blocks.find((b) => b.key === "custom");
    expect(custom).toMatchObject({ title: "Proceso" });
    expect(custom?.body).toMatch(/caminando por la Ribeira Sacra/);
    const none = agent("añade una sección sobre prensa", ["Pinto bancales."]);
    expect(none.structure.blocks.some((b) => b.key === "custom")).toBe(false);
    expect(none.rationale).toMatch(/cuéntamelo y la añado/);
  });

  it("guard keeps the works and the CV the call asks for", () => {
    const d = presetDesign("sobrio", "creator");
    d.structure = { length: "completo", blocks: [{ key: "statement" }] };
    const call: Call = { ...structuredClone(fixtureCalls[0]), requiredDocuments: ["Currículum artístico", "Dossier"] };
    const { design, adjustments } = guardDesign(d, { call });
    expect(design.structure.blocks.map((b) => b.key)).toEqual(["statement", "works", "cv"]);
    expect(adjustments.join(" ")).toMatch(/obras/);
    expect(adjustments.join(" ")).toMatch(/currículum/);
  });
});

describe("CV lines as people say them", () => {
  it("takes a leading year with a colon into the year column", async () => {
    const { toCvItem } = await import("@/features/dossier/model");
    expect(toCvItem("2025: hicimos gira por Portugal", "groupShows")).toMatchObject({ year: "2025", text: "Hicimos gira por Portugal" });
  });
});
