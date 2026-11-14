import { describe, expect, it } from "vitest";
import type { Call, Profile } from "@/contracts";
import { DEMO_CREATOR_ID, FIXTURE_NOW, fixtureBusiness, fixtureCalls, fixtureCreator } from "@/fixtures";
import { evaluate, fitLabel, ownWords, SCORE_MAX } from "@/features/matching/rules";
import { explainCall, searchCalls } from "@/features/matching/service";
import { readDb, saveProfile } from "@/server/store";

const now = new Date(FIXTURE_NOW);
const call = (id: string) => structuredClone(fixtureCalls.find((c) => c.id === id)!);
const beca = () => call("fixture-beca-artes-plasticas");
const digital = () => call("fixture-digitalizacion-pymes");
const creator = (): Profile => structuredClone(fixtureCreator);
const business = (): Profile => structuredClone(fixtureBusiness);

describe("hard filters", () => {
  it("creator fits the arts grant with a high score, not the SME aid", () => {
    const r = evaluate(creator(), beca(), { now, worksCount: 2 });
    expect(r.match.eligible).toBe(true);
    expect(r.match.score).toBeGreaterThanOrEqual(75);
    expect(fitLabel(r.match.score)).toBe("alto");
    expect(r.match.whyYouFit.join(" ")).toMatch(/Vives en A Coruña: cumple el requisito de A Coruña/);
    expect(evaluate(creator(), digital(), { now }).match.eligible).toBe(false);
  });

  it("business fits the SME aid, not the arts grant", () => {
    const r = evaluate(business(), digital(), { now });
    expect(r.match.eligible).toBe(true);
    expect(r.match.whyYouFit.join(" ")).toMatch(/Puedes presentarte como autónomo/);
    expect(evaluate(business(), beca(), { now }).match.eligible).toBe(false);
  });

  it("a 40-year-old fails maxAge 35 with a reason", () => {
    const r = evaluate({ ...creator(), birthYear: 1986 }, beca(), { now });
    expect(r.match.eligible).toBe(false);
    expect(r.match.score).toBe(0);
    expect(r.match.whatYouMiss.join(" ")).toMatch(/Edad fuera del rango \(18–35 años\)/);
  });

  it("borderline age and unknown fields ask to confirm instead of discarding", () => {
    const borderline = evaluate({ ...creator(), birthYear: 2026 - 36 }, beca(), { now }); // 35 or 36 at the deadline
    expect(borderline.match.eligible).toBe(true);
    expect(borderline.match.whatYouMiss.join(" ")).toMatch(/Confírmalo: edad exigida 18–35 años/);

    const unknown = evaluate({ ...creator(), birthYear: undefined, territory: undefined, city: undefined, province: undefined, region: undefined }, beca(), { now });
    expect(unknown.match.eligible).toBe(true);
    expect(unknown.match.whatYouMiss).toEqual(expect.arrayContaining([expect.stringMatching(/^Confírmalo: edad exigida/), expect.stringMatching(/^Confírmalo: exige residencia en A Coruña/)]));
  });

  it("wrong residence, legal form or size discards with the reason", () => {
    expect(evaluate({ ...creator(), territory: undefined, city: "Vigo", province: "Pontevedra" }, beca(), { now }).match.whatYouMiss).toContain("Exige residencia o sede en A Coruña");
    expect(evaluate({ ...business(), legalForm: "asociacion", beneficiaryTypes: [] }, digital(), { now }).match.eligible).toBe(false);
    const big = evaluate({ ...business(), employees: 20 }, digital(), { now });
    expect(big.match.eligible).toBe(false);
    expect(big.match.whatYouMiss.join(" ")).toMatch(/Máximo 9 empleados/);
  });

  it("closed calls and past deadlines are excluded; upcoming ones are allowed and labelled", () => {
    expect(evaluate(creator(), { ...beca(), status: "closed" } as Call, { now }).excluded).toBe(true);
    expect(evaluate(creator(), { ...beca(), deadline: "2026-11-01" }, { now }).excluded).toBe(true);
    const up = evaluate(creator(), { ...beca(), status: "upcoming", opensAt: "2027-02-01", deadline: "2027-03-01" }, { now });
    expect(up.excluded).toBe(false);
    expect(up.match.whyYouFit.join(" ")).toMatch(/Abre pronto/);
  });
});

describe("score", () => {
  // Was "is 40 + breakdown": the fixed base dropped from 40 to 25 so the personal part (affinity, now 0-45) weighs more.
  it("is base 25 + breakdown, bounded to 100, and deterministic", () => {
    const a = evaluate(creator(), beca(), { now, worksCount: 2 });
    const b = evaluate(creator(), beca(), { now, worksCount: 2 });
    expect(a).toEqual(b);
    const { base, affinity, documents, amount, timing } = a.breakdown;
    expect(base).toBe(SCORE_MAX.base);
    expect(Object.values(SCORE_MAX).reduce((x, y) => x + y, 0)).toBe(100);
    expect(base + affinity + documents + amount + timing).toBe(a.match.score);
    expect(a.match.score).toBeLessThanOrEqual(100);
  });

  it("documents: having works counts as dossier; certificates are always flagged as missing", () => {
    const without = evaluate(creator(), beca(), { now, worksCount: 0 });
    const withWorks = evaluate(creator(), beca(), { now, worksCount: 2 });
    expect(withWorks.breakdown.documents).toBeGreaterThan(without.breakdown.documents);
    expect(withWorks.match.whatYouMiss).toContain("Te falta: certificado de estar al corriente con Hacienda y la Seguridad Social");
  });

  it("a call closing in 2 days is flagged as urgent", () => {
    const r = evaluate(creator(), { ...beca(), deadline: "2026-11-15" }, { now });
    expect(r.match.whatYouMiss.join(" ")).toMatch(/Cierra en 2 días/);
  });

  it("the profile's own words count 0-20 inside affinity; place names and generic call words do not", () => {
    const silent = { ...creator(), statement: "", bio: "", projectIdea: undefined, fundingNeeds: [], achievements: [] };
    const words = { ...beca(), summary: `${beca().summary} Acuarelas sobre rederas y mariscadoras, fanzine, memoria de las mujeres del mar.` };
    const full = evaluate(creator(), words, { now }).breakdown.affinity;
    const none = evaluate(silent, words, { now }).breakdown.affinity;
    expect(full - none).toBeGreaterThan(0);
    expect(full - none).toBeLessThanOrEqual(20);
    expect(ownWords(silent, words)).toEqual([]);
    // the profile's city and words every call uses ("exposición", "trabajo") are not personal
    const generic = { ...beca(), summary: "Exposición en A Coruña para trabajos de artistas." };
    expect(ownWords({ ...creator(), statement: "Mi trabajo se expone en A Coruña" }, generic)).toEqual([]);
    expect(evaluate({ ...creator(), statement: words.summary.repeat(3) }, words, { now }).breakdown.affinity).toBeLessThanOrEqual(SCORE_MAX.affinity);
  });

  it("discipline overlap outranks an unrelated discipline", () => {
    const fit = evaluate(creator(), beca(), { now });
    const off = evaluate(creator(), { ...beca(), disciplines: ["música"] }, { now });
    expect(fit.breakdown.affinity).toBeGreaterThan(off.breakdown.affinity);
  });
});

describe("service", () => {
  it("searchCalls returns only eligible calls for the profile, best first", async () => {
    await saveProfile(creator());
    const results = await searchCalls({ profileId: DEMO_CREATOR_ID });
    const ids = results.map((r) => r.call.id);
    expect(ids).toContain("fixture-beca-artes-plasticas");
    expect(ids).not.toContain("fixture-digitalizacion-pymes");
    expect(results.every((r) => r.match.eligible)).toBe(true);
    const scores = results.map((r) => r.match.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });

  it("explainCall keeps the rule score and caches the explanation", async () => {
    await saveProfile(creator());
    const first = await explainCall({ callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID });
    expect(first.match.plainSummary).toBeTruthy();
    expect(first.checklist).toEqual(first.call.requiredDocuments);
    expect(readDb().matchCache).toHaveLength(1);
    const again = await explainCall({ callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID });
    expect(again.match.score).toBe(first.match.score);
    expect(readDb().matchCache).toHaveLength(1);
  });
});

describe("documents wording", () => {
  it("a declaración responsable is not a certificate", () => {
    const c = { ...beca(), requiredDocuments: ["Declaración responsable de estar al corriente con Hacienda y Seguridad Social"] };
    const r = evaluate(creator(), c, { now });
    expect(r.match.whatYouMiss).toContain("Te falta: declaración responsable firmada");
    expect(r.match.whatYouMiss.join(" ")).not.toMatch(/certificado/);
  });
});

describe("pyme wording", () => {
  const photosCall: Call = { ...fixtureCalls.find((c) => c.id === "fixture-digitalizacion-pymes")!, requiredDocuments: ["Fotografías de los productos", "Memoria técnica"] };

  it("never asks a pyme for a 'dossier con tus obras', and counts what it wants to finance as the memoria idea", () => {
    const r = evaluate({ ...fixtureBusiness, projectIdea: undefined }, photosCall, { hasDossier: true, worksCount: 0 });
    const all = [...r.match.whyYouFit, ...r.match.whatYouMiss].join(" | ");
    expect(all).not.toMatch(/dossier|obras/);
    expect(r.match.whatYouMiss).toContain("Te falta: fotos de tus productos o tu actividad");
    expect(r.match.whyYouFit).toContain("Ya tienes la idea de lo que queréis financiar, para la memoria");
  });

  it("creators keep their wording", () => {
    const art: Call = { ...fixtureCalls.find((c) => c.beneficiaryKinds.includes("creator"))!, requiredDocuments: ["Dossier de obra"] };
    const r = evaluate(fixtureCreator, art, { hasDossier: true });
    expect(r.match.eligible).toBe(true);
    expect(r.match.whyYouFit.join(" ")).toMatch(/dossier con tus obras/);
  });
});
