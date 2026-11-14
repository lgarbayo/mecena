import { describe, expect, it } from "vitest";
import type { DossierSection } from "@/contracts";
import { DEMO_CREATOR_ID, FIXTURE_NOW, fixtureCreator } from "@/fixtures";
import { buildCv, dedupeContained, toCreatorView } from "@/features/dossier/model";
import { planCreator } from "@/features/dossier/structure";

// Production case (2026-11-14): a hip-hop musician with no works uploaded. The CV showed the two EPs twice
// under «Discografía» (the works section and the CV say the same thing), and the series text sat under a
// «Repertorio» heading that repeated the rail.
const section = (key: DossierSection["key"], body: string): DossierSection => ({ key, title: key, body, sourceSegmentIds: [], status: "draft", updatedAt: FIXTURE_NOW });
const luys = {
  ...fixtureCreator,
  displayName: "Luys",
  disciplines: ["hip-hop", "música"],
  education: [],
  achievements: ["Dos EPs publicados", "Primer EP: Dolor", "Segundo EP: Amor"],
  projectIdea: undefined,
};
const sections = [
  section("works", "- Dolor (primer EP)\n- Amor (segundo EP)"),
  section("cv", "- Dos EPs publicados: el primero, Dolor, y el segundo, Amor.\n- Mi música está en Spotify."),
  section("series", "Presentación de mis dos EPs en conferencias y charlas sobre hip-hop."),
];
const view = () =>
  toCreatorView({ profile: luys, dossier: { profileId: DEMO_CREATOR_ID, kind: "creator", sections, workIds: [], generatedAt: FIXTURE_NOW }, works: [] });

describe("Trayectoria without repeats (Luys)", () => {
  it("an entry already contained in another one is not repeated", () => {
    const groups = view().cv;
    const all = groups.flatMap((g) => g.items.map((i) => i.text));
    expect(all.filter((t) => /EP/i.test(t))).toEqual(["Dos EPs publicados: el primero, Dolor, y el segundo, Amor"]);
    const disco = groups.find((g) => g.title === "Discografía");
    expect(disco?.items).toHaveLength(1);
  });

  it("keeps entries that only share some words", () => {
    expect(dedupeContained(["Exposición colectiva en el Kiosko Alfonso (2024)", "Exposición individual en la Fundación Luis Seoane (2025)"])).toHaveLength(2);
    expect(dedupeContained(["Premio Injuve 2023", "Premio Injuve"])).toEqual(["Premio Injuve 2023"]);
    // Different years are different entries.
    expect(dedupeContained(["Premio Injuve 2023", "Premio Injuve 2024"])).toHaveLength(2);
  });

  it("the CV of the fixture artist is unchanged", () => {
    const cv = buildCv(fixtureCreator);
    expect(cv.flatMap((g) => g.items)).toHaveLength(3);
  });

  it("with no works, the series text is not titled «Repertorio» twice: the rail fits the text", () => {
    const v = view();
    expect(v.series).toHaveLength(1);
    expect(v.series[0].title).toBe("");
    expect(v.series[0].description[0]).toMatch(/Presentación de mis dos EPs/);
    const works = planCreator(v).blocks.find((b) => b.kind === "works");
    expect(works?.title).toBe("Proyecto");
  });
});
