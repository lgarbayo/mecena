/**
 * data/demo/*.json: valid against the domain contracts, coherent with each other and with the REAL curated calls
 * (data/calls/calls.json), images are our own PNGs, and the stage personas fit what the demo needs.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BusinessSectionKey, Call, CreatorSectionKey } from "@/contracts";
import { fixtureCreator } from "@/fixtures";
import { loadArtist, loadBusiness, loadPro, pickProCall, workImagePath } from "@/features/demo/scenarios";

const realCalls: Call[] = (JSON.parse(fs.readFileSync(path.resolve("data/calls/calls.json"), "utf8")) as unknown[]).map((c) => Call.parse(c));
const DEMO_DAY = "2026-11-14";

describe("demo scenario files", () => {
  it("parse with the contract schemas", () => {
    expect(() => loadArtist()).not.toThrow();
    expect(() => loadBusiness()).not.toThrow();
    expect(() => loadPro()).not.toThrow();
  });

  it("the artist is the fixture creator (A Coruña, illustration and painting) with a full profile", () => {
    const { profile } = loadArtist();
    expect(profile.kind).toBe("creator");
    expect(profile).toMatchObject({ displayName: fixtureCreator.displayName, city: "A Coruña", province: "A Coruña", region: "Galicia" });
    expect(profile.disciplines).toEqual(expect.arrayContaining(["ilustración", "pintura"]));
    for (const k of ["bio", "statement", "projectIdea"] as const) expect(profile[k]?.length).toBeGreaterThan(20);
    for (const k of ["achievements", "education", "fundingNeeds", "languages"] as const) expect(profile[k].length).toBeGreaterThan(0);
  });

  it("the artist has a realistic Spanish transcript with unique segment ids, and every dossier section cites it", () => {
    const a = loadArtist();
    const ids = a.transcript.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(a.transcript.length).toBeGreaterThanOrEqual(8);
    expect(a.transcript.map((s) => s.text).join(" ")).toMatch(/A Coruña/);
    for (const s of a.dossier) for (const id of s.sourceSegmentIds) expect(ids).toContain(id);
  });

  it("the artist dossier has every creator section and the business memoria every business section", () => {
    expect(loadArtist().dossier.map((s) => s.key).sort()).toEqual([...CreatorSectionKey.options].sort());
    expect(loadBusiness().dossier.map((s) => s.key).sort()).toEqual([...BusinessSectionKey.options].sort());
    for (const s of [...loadArtist().dossier, ...loadBusiness().dossier]) expect(s.body.trim().length).toBeGreaterThan(20);
  });

  it("3 works with confirmed-quality sheets and our own PNG photos (never third-party art)", () => {
    const { works } = loadArtist();
    expect(works).toHaveLength(3);
    const license = fs.readFileSync(path.resolve("data/demo/works/LICENSE.md"), "utf8");
    expect(license).toMatch(/CC0/);
    for (const w of works) {
      expect(w.sheet).toMatchObject({ title: expect.any(String), year: expect.any(Number), technique: expect.any(String), dimensions: expect.stringMatching(/cm/) });
      const bytes = fs.readFileSync(workImagePath(w.image));
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
      expect(license).toContain(w.image);
    }
  });

  it("the example pyme has ≥ 3 employees (real SME aid asks for it), Galician location and a CNAE", () => {
    const { profile } = loadBusiness();
    expect(profile.kind).toBe("business");
    expect(profile.employees).toBeGreaterThanOrEqual(3);
    expect(profile).toMatchObject({ region: "Galicia", legalForm: "sl", cnae: expect.stringMatching(/^\d{4}$/) });
    for (const s of loadBusiness().dossier) for (const id of s.sourceSegmentIds) expect(loadBusiness().transcript.map((t) => t.id)).toContain(id);
  });

  it("the Pro application targets a real call that exists and is open on demo day, with published criteria", () => {
    const pro = loadPro();
    const first = realCalls.find((c) => c.id === pro.callIds[0]);
    expect(first, `${pro.callIds[0]} must exist in data/calls/calls.json`).toBeDefined();
    const call = pickProCall(pro, realCalls)!;
    expect(call.id).toBe(pro.callIds[0]);
    expect(call.status).toBe("open");
    expect(call.deadline! >= DEMO_DAY).toBe(true);
    expect(call.beneficiaryKinds).toContain("creator");
    expect(call.criteriaSource).toBe("bases");
    expect(call.criteria.length).toBeGreaterThan(0);
  });

  it("the Pro application quotes the artist's own words (segment ids exist in her transcript)", () => {
    const ids = new Set(loadArtist().transcript.map((s) => s.id));
    const { application } = loadPro();
    expect(application.sections.map((s) => s.key)).toEqual(expect.arrayContaining(["memoria", "statement"]));
    for (const s of application.sections) for (const id of s.sourceSegmentIds) expect(ids.has(id)).toBe(true);
    expect(application.sections.some((s) => s.sourceSegmentIds.length > 0)).toBe(true);
  });

  it("falls back to another open creator call when the listed ones are gone", () => {
    const pro = { ...loadPro(), callIds: ["no-such-call"] };
    const call = pickProCall(pro, realCalls);
    expect(call?.status).toBe("open");
    expect(call?.beneficiaryKinds).toContain("creator");
    expect(pickProCall(pro, [])).toBeUndefined();
  });

  it("the fixture work images referenced by src/fixtures exist under public/", () => {
    for (const f of ["demo/works/redeira-1.svg", "demo/works/marisqueo.svg"]) expect(fs.existsSync(path.resolve("public", f))).toBe(true);
  });
});
