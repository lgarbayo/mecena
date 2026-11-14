import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Profile } from "@/contracts";
import { FIXTURE_NOW, fixtureBusiness, fixtureCreator } from "@/fixtures";
import { fitLabel, searchCalls } from "@/features/matching/service";
import { saveProfile } from "@/server/store";

// The feed is personal: on the real dataset (data/calls/calls.json), different profiles must see a clearly
// different top, because the score (discipline/sector fit + the profile's own words) decides the order.
const now = new Date(FIXTURE_NOW);

/** A video-maker from Valencia (creator), no legal form. */
const realizadora: Profile = {
  id: "test-realizadora-valencia",
  kind: "creator",
  displayName: "Laia Ferrer",
  city: "Valencia",
  province: "Valencia",
  region: "Comunitat Valenciana",
  beneficiaryTypes: [],
  birthYear: 1990,
  disciplines: ["audiovisual", "cine"],
  bio: "Realizadora audiovisual en Valencia.",
  statement: "Dirijo cortometrajes de ficción y videoarte con equipos pequeños.",
  achievements: ["Cortometraje seleccionado en festivales"],
  education: [],
  links: [],
  fundingNeeds: ["rodar un cortometraje", "distribución en festivales"],
  projectIdea: "Cortometraje de ficción sobre la Albufera",
  languages: [],
  updatedAt: FIXTURE_NOW,
};

/** An audiovisual production company (SL) from Valencia. */
const productora: Profile = {
  ...realizadora,
  id: "test-productora-valencia",
  kind: "business",
  displayName: "Llum Films SL",
  legalForm: "sl",
  cnae: "5911",
  sector: "producción audiovisual / cine",
  employees: 4,
  disciplines: [],
  birthYear: undefined,
  bio: "Productora de cortometrajes y documentales en Valencia.",
  statement: "Producimos cine de autor y cortometrajes de ficción con equipos locales.",
};

/** A Galician writer: same kind and region as the illustrator, other disciplines and words. */
const escritora: Profile = {
  ...structuredClone(fixtureCreator),
  id: "test-escritora-galicia",
  displayName: "Uxía Rial",
  disciplines: ["poesía", "narrativa"],
  bio: "Poeta y narradora de Ourense.",
  statement: "Escribo poesía y novela corta sobre la emigración gallega.",
  achievements: ["Poemario publicado en una editorial gallega"],
  fundingNeeds: ["terminar una novela", "publicar un poemario"],
  projectIdea: "Novela corta sobre las mujeres que se quedaron",
};

async function top(profile: Profile, n: number) {
  await saveProfile(structuredClone(profile));
  const all = await searchCalls({ profileId: profile.id, now });
  const slice = all.slice(0, n);
  return {
    ids: slice.map((r) => r.call.id),
    scores: all.map((r) => r.match.score),
    statuses: slice.map((r) => r.call.status),
    scoreOf: (id: string) => all.find((r) => r.call.id === id)?.match.score ?? 0,
    /** Calls labelled alto or medio for this profile. */
    good: all.filter((r) => fitLabel(r.match.score) !== "bajo").map((r) => r.call.id),
  };
}

const shared = (a: string[], b: string[]) => a.filter((x) => b.includes(x));

beforeEach(() => {
  fs.copyFileSync(path.resolve("data/calls/calls.json"), path.join(process.env.MECENA_CALLS_DIR!, "calls.json"));
});

describe("personal ranking on the real dataset", () => {
  it("a Galician illustrator and a Valencian video-maker see different tops, each led by her own discipline", async () => {
    const antia = await top(fixtureCreator, 5);
    const laia = await top(realizadora, 5);
    expect(antia.ids[0]).not.toBe(laia.ids[0]);
    // What fits each of them well (alto/medio) does not overlap at all.
    expect(antia.good.length).toBeGreaterThanOrEqual(5);
    expect(shared(antia.good, laia.good)).toEqual([]);
    // A call in both top-5 is a good fit for one and a weak one for the other.
    for (const id of shared(antia.ids, laia.ids)) expect([fitLabel(antia.scoreOf(id)), fitLabel(laia.scoreOf(id))], id).toContain("bajo");
    expect(laia.ids[0]).toBe("sant-joan-festival-cine-cortometrajes-2027"); // the only short-film contest a creator can enter
    expect(antia.ids).not.toContain("sant-joan-festival-cine-cortometrajes-2027");
    // a closed edition (A Coruña arts grants) never takes a place in the free top: open and upcoming calls go first
    expect(antia.statuses).not.toContain("recurring");
    expect(laia.ids).not.toContain("deputacion-coruna-bolsas-perfeccionamento-artistico-2026"); // residence
  });

  it("two Galician creators with different disciplines and words get different tops (same kind, same region)", async () => {
    const antia = await top(fixtureCreator, 5);
    const uxia = await top(escritora, 5);
    expect(shared(antia.ids.slice(0, 3), uxia.ids.slice(0, 3))).toEqual([]);
    expect(shared(antia.good, uxia.good)).toEqual([]);
    expect(uxia.ids.slice(0, 3)).toEqual(expect.arrayContaining(["fornelos-premio-poesia-lueiro-rey-2026"]));
  });

  // Mostly the kind filter (a pyme only sees aid open to businesses); the score then orders what is left.
  it("an artist and a pyme share nothing in their top 5", async () => {
    const artist = await top(fixtureCreator, 5);
    const pyme = await top(fixtureBusiness, 5);
    expect(shared(artist.ids, pyme.ids)).toEqual([]);
    expect(pyme.ids[0]).toBe("artesania-galicia-premios-bolsas-eloy-gesto-2026"); // crafts business → crafts awards
  });

  it("an audiovisual production company leads with film aid, ahead of open calls with a lower fit", async () => {
    const llum = await top(productora, 3);
    // The two film calls lead; the festival is from the company's own comunidad and open now, the ICAA aid opens later.
    expect(new Set(llum.ids.slice(0, 2))).toEqual(new Set(["icaa-cortometrajes-realizados-2027", "sant-joan-festival-cine-cortometrajes-2027"]));
    expect(llum.statuses.slice(0, 2).sort()).toEqual(["open", "upcoming"]);
  });

  it("open and upcoming calls come first, ordered by score; closed editions (recurring) go behind all of them", async () => {
    for (const p of [fixtureCreator, realizadora, productora, fixtureBusiness]) {
      const { scores, statuses } = await top(p, 25);
      const firstRecurring = statuses.indexOf("recurring");
      if (firstRecurring >= 0) expect(statuses.slice(firstRecurring).every((x) => x === "recurring"), p.id).toBe(true);
      const live = scores.slice(0, firstRecurring < 0 ? scores.length : firstRecurring);
      expect([...live].sort((x, y) => y - x), p.id).toEqual(live);
    }
  });

  it("Re-acciona asks for at least 3 workers: a one-employee autónomo is not matched with it", async () => {
    const pyme = await top(fixtureBusiness, 25);
    expect(fixtureBusiness.employees).toBe(1);
    expect(pyme.ids).not.toContain("igape-re-acciona-2026");
    const grown = await top({ ...fixtureBusiness, id: "test-pyme-5", employees: 5 }, 25);
    expect(grown.ids).toContain("igape-re-acciona-2026");
  });
});
