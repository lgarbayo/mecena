import { describe, expect, it } from "vitest";
import { artFamily, defaultMediaKind, disciplineFamily, mediaKindFromLink, TechnicalSheet, Work, Db } from "@/contracts";
import { fixtureWorks } from "@/fixtures";

describe("artFamily (CCR-arts)", () => {
  it.each([
    [["pintura"], "artes-visuales"],
    [["Ilustración", "grabado"], "artes-visuales"],
    [["pianista"], "musica"],
    [["Compositora", "cuarteto de cuerda"], "musica"],
    [["bailarina"], "artes-escenicas"],
    [["danza contemporánea"], "artes-escenicas"],
    [["actriz", "dramaturgia"], "artes-escenicas"],
    [["circo"], "artes-escenicas"],
    [["cine documental"], "audiovisual"],
    [["cortometrajes"], "audiovisual"],
    [["poeta"], "literatura"],
    [["novelista"], "literatura"],
    [["libro ilustrado"], "artes-visuales"],
    [["ceramista"], "artesania"],
    [["diseño gráfico"], "diseno"],
    [["comisaria"], "gestion-cultural"],
    [["musica-moderna"], "musica"],
    [["teatro"], "artes-escenicas"],
  ] as const)("%j -> %s", (disciplines, family) => {
    expect(artFamily([...disciplines])).toBe(family);
  });

  it("defaults to visual arts when nothing is recognisable or empty", () => {
    expect(artFamily([])).toBe("artes-visuales");
    expect(artFamily(undefined)).toBe("artes-visuales");
    expect(artFamily(["cosas raras"])).toBe("artes-visuales");
    expect(disciplineFamily("")).toBeUndefined();
  });

  it("majority wins; ties go to the first discipline named", () => {
    expect(artFamily(["bailarina", "pianista", "cantante"])).toBe("musica");
    expect(artFamily(["poeta", "pintora"])).toBe("literatura");
  });

  it("defaultMediaKind per family", () => {
    expect(defaultMediaKind("artes-visuales")).toBe("image");
    expect(defaultMediaKind("musica")).toBe("audio");
    expect(defaultMediaKind("artes-escenicas")).toBe("performance");
    expect(defaultMediaKind("audiovisual")).toBe("video");
    expect(defaultMediaKind("literatura")).toBe("text");
    expect(defaultMediaKind("artesania")).toBe("object");
  });

  it("mediaKindFromLink", () => {
    expect(mediaKindFromLink("https://www.youtube.com/watch?v=abc")).toBe("video");
    expect(mediaKindFromLink("https://youtu.be/abc")).toBe("video");
    expect(mediaKindFromLink("https://vimeo.com/123")).toBe("video");
    expect(mediaKindFromLink("https://lua.bandcamp.com/album/nana")).toBe("audio");
    expect(mediaKindFromLink("https://soundcloud.com/x/y")).toBe("audio");
    expect(mediaKindFromLink("https://open.spotify.com/track/1")).toBe("audio");
    expect(mediaKindFromLink("https://editorial.example.com/libro")).toBeUndefined();
    expect(mediaKindFromLink("no es una url")).toBeUndefined();
  });
});

describe("old data still parses (CCR-arts)", () => {
  it("a pre-arts Work gets mediaKind image and no links", () => {
    const old = { id: "w", profileId: "p", imageUrl: "/x.jpg", sheet: { title: "Redeira I", technique: "acuarela" }, sheetSource: "seed", createdAt: "2026-11-13T00:00:00.000Z" };
    const w = Work.parse(old);
    expect(w.mediaKind).toBe("image");
    expect(w.links).toEqual([]);
    expect(w.sheet.duration).toBeUndefined();
  });

  it("fixtures and a whole old Db parse", () => {
    for (const w of fixtureWorks) expect(Work.parse(w).mediaKind).toBe("image");
    const db = Db.parse({
      meta: { activeProfileId: "p", appUserId: "u" },
      profiles: [], transcripts: [], works: fixtureWorks, dossiers: [], applications: [], juryScores: [], entitlements: [], usage: [], matchCache: [],
    });
    expect(db.works[0].links).toEqual([]);
  });

  it("new sheet fields and links validate", () => {
    expect(TechnicalSheet.parse({ title: "Nana para Lúa", duration: "6 min", credits: "Cuarteto Vigo", venue: "Auditorio de Galicia" }).venue).toBe("Auditorio de Galicia");
    expect(() => Work.parse({ id: "w", profileId: "p", imageUrl: "/x.jpg", sheet: { title: "x" }, sheetSource: "voice", createdAt: "x", links: ["no-url"] })).toThrow();
  });
});
