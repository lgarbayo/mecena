import { mockUnmappedResolver, normalizeDiscipline, suggestForUnmapped, type UnmappedResolver } from "@/features/normalize";

describe("AI fallback for unmapped soft vocabulary", () => {
  it("mock is deterministic and only returns taxonomy ids", async () => {
    const unmapped = normalizeDiscipline("arte textil sostenible, astrofísica").unmapped;
    expect(unmapped).toContain("astrofísica");
    const a = await suggestForUnmapped("discipline", ["obra cerámica contemporánea", "astrofísica"]);
    const b = await suggestForUnmapped("discipline", ["obra cerámica contemporánea", "astrofísica"]);
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({ suggested: true });
    expect(a[0].ids).toContain("ceramica");
    expect(a[1].ids).toEqual([]);
  });

  it("drops ids outside the taxonomy and survives a failing resolver", async () => {
    const liar: UnmappedResolver = { suggest: async () => ["pintura", "eligible-for-everything"] };
    expect((await suggestForUnmapped("discipline", ["x"], liar))[0].ids).toEqual(["pintura"]);
    const broken: UnmappedResolver = { suggest: async () => Promise.reject(new Error("rate limit")) };
    expect((await suggestForUnmapped("document", ["x"], broken))[0].ids).toEqual([]);
    expect((await mockUnmappedResolver.suggest({ vocabulary: "document", text: "presupuesto económico detallado", allowedIds: [] }))).toContain("presupuesto");
  });
});
