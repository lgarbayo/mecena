import { taxonomy, DISCIPLINE_IDS, normalizeBeneficiary, isBusinessDay, keyOf } from "@/features/normalize";

describe("taxonomy data files", () => {
  it("disciplines: unique ids, parents exist, every family has children", () => {
    const ids = taxonomy.disciplines.items.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of taxonomy.disciplines.items) if (d.parent) expect(ids).toContain(d.parent);
    const families = taxonomy.disciplines.items.filter((d) => !d.parent).map((d) => d.id);
    expect(families).toEqual(expect.arrayContaining(["artes-visuales", "musica", "artes-escenicas", "audiovisual", "literatura", "diseno", "artesania"]));
    for (const f of families) expect(taxonomy.disciplines.items.some((d) => d.parent === f)).toBe(true);
  });

  it("disciplines: no synonym points to two different families (would make matching ambiguous)", () => {
    const owner = new Map<string, string>();
    const family = (id: string): string => {
      const d = taxonomy.disciplines.items.find((x) => x.id === id)!;
      return d.parent ? family(d.parent) : d.id;
    };
    const clashes: string[] = [];
    for (const d of taxonomy.disciplines.items)
      for (const s of [d.label.es, d.label.gl, ...d.synonyms]) {
        const k = keyOf(s);
        const prev = owner.get(k);
        if (prev && family(prev) !== family(d.id)) clashes.push(`${k}: ${prev} / ${d.id}`);
        owner.set(k, d.id);
      }
    expect(clashes).toEqual([]);
  });

  it("territories: full Spanish NUTS tree, 313 Galician municipalities, INE codes on provinces", () => {
    const items = taxonomy.territories.items;
    const ids = new Set(items.map((n) => n.id));
    expect(ids.size).toBe(items.length);
    for (const n of items) if (n.parent) expect(ids.has(n.parent)).toBe(true);
    expect(items.filter((n) => n.level === "ccaa")).toHaveLength(19);
    const provinces = items.filter((n) => n.level === "province");
    expect(provinces.length).toBeGreaterThanOrEqual(52 - 2 + 8); // islands split Baleares/Canarias into NUTS3
    for (const p of provinces) expect(p.ine).toMatch(/^\d{2}$/);
    const muni = items.filter((n) => n.level === "municipality");
    expect(muni).toHaveLength(313);
    for (const m of muni) expect(["ES111", "ES112", "ES113", "ES114"]).toContain(m.parent);
    expect(muni.filter((m) => m.parent === "ES111")).toHaveLength(93);
  });

  it("beneficiaries: every live BDNS catalogue entry is mapped", async () => {
    const live = (await import("../../data/taxonomy/bdns/beneficiarios.json")).default.items;
    for (const b of live) {
      const r = normalizeBeneficiary(b.descripcion);
      expect(r.source).toBe("bdns");
      if (b.id !== 5) expect(r.ids.length).toBeGreaterThan(0);
    }
  });

  it("documents and discipline ids are kebab-case", () => {
    for (const id of [...DISCIPLINE_IDS, ...taxonomy.documents.items.map((d) => d.id)]) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("holidays: Galician holidays are inhábiles only when Galicia's calendar applies", () => {
    for (const days of Object.values(taxonomy.holidays.regional.ES11))
      for (const d of days) {
        expect(isBusinessDay(d, ["ES11"])).toBe(false);
        const weekend = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
        expect(isBusinessDay(d, [])).toBe(!weekend);
      }
    expect(isBusinessDay("2026-12-08")).toBe(false);
    expect(isBusinessDay("2026-07-24", ["ES11"])).toBe(true);
  });
});
