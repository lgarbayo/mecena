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
    // the Galician artist gets the A Coruña arts grants near the top; the Valencian never sees them (residence)
    expect(antia.ids).toContain("deputacion-coruna-bolsas-perfeccionamento-artistico-2026");
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
    // ICAA opens later (upcoming) but fits better than the open festival: the old status-first sort put it second.
    expect(llum.ids.slice(0, 2)).toEqual(["icaa-cortometrajes-realizados-2027", "sant-joan-festival-cine-cortometrajes-2027"]);
    expect(llum.statuses.slice(0, 2)).toEqual(["upcoming", "open"]);
  });

  it("the score decides the order; status only breaks ties (a recurring call with a much better fit goes first)", async () => {
    for (const p of [fixtureCreator, realizadora, productora, fixtureBusiness]) {
      const { scores } = await top(p, 25);
      expect([...scores].sort((x, y) => y - x), p.id).toEqual(scores);
    }
    const pyme = await top(fixtureBusiness, 5);
    expect(pyme.statuses[0]).toBe("recurring"); // the crafts awards: the pyme's own sector
    expect(pyme.statuses).toContain("open");
  });

  it("with the same fit, what you can apply for now ranks first: the pyme's open aid closing in 3 days is in its free top 3", async () => {
    const pyme = await top(fixtureBusiness, 3);
    expect(pyme.ids).toContain("igape-re-acciona-2026"); // open, closes 2026-11-16
    expect(pyme.scoreOf("igape-re-acciona-2026")).toBeGreaterThan(pyme.scoreOf("xunta-bono-autonomo-tr341q-2026")); // same fit, recurring
    // general aid for autónomos/pymes it is eligible for is a real fit, not "bajo"
    expect(fitLabel(pyme.scoreOf("igape-re-acciona-2026"))).not.toBe("bajo");
    expect(fitLabel(pyme.scoreOf("xunta-bono-autonomo-tr341q-2026"))).not.toBe("bajo");
  });
});
