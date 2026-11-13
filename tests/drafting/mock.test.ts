import { describe, expect, it } from "vitest";
import { PaymentRequiredError } from "@/contracts";
import { DEMO_APP_USER_ID, DEMO_BUSINESS_ID, DEMO_CREATOR_ID, fixtureCalls, fixtureCreator, fixtureTranscript, fixtureBusiness } from "@/fixtures";
import { draftingAi } from "@/features/drafting/ai";
import { buildChecklist, fitBudget } from "@/features/drafting/rules";
import { draftApplication, draftSources, findDraft } from "@/features/drafting/service";
import { readDb } from "@/server/store";
import { grantPro, seedOnboardedCreator } from "../helpers";

const beca = fixtureCalls.find((c) => c.id === "fixture-beca-artes-plasticas")!;
const digital = fixtureCalls.find((c) => c.id === "fixture-digitalizacion-pymes")!;

const d = await draftingAi.mock.draftApplication({ profile: fixtureCreator, call: beca, transcript: fixtureTranscript, works: [] });

describe("mock draft (creator × beca)", () => {
  const section = (k: string) => d.sections.find((s) => s.key === k)!;

  it("has memoria and statement written with the user's phrases, with their segment ids", () => {
    for (const key of ["memoria", "statement"]) {
      const s = section(key);
      expect(s, key).toBeDefined();
      expect(s.sourceSegmentIds.length, key).toBeGreaterThan(0);
      const quoted = fixtureTranscript.filter((t) => s.sourceSegmentIds.includes(t.id));
      for (const t of quoted) expect(s.body, `${key} quotes ${t.id}`).toContain(t.text);
    }
    expect(section("memoria").body).toContain("Quiero hacer una serie de doce acuarelas grandes");
    expect(section("statement").body).toContain("Pinto a las rederas y mariscadoras de mi familia");
  });

  it("marks gaps instead of inventing them", () => {
    expect(section("memoria").body).toMatch(/\[Completa: [^\]]+\]/);
  });

  it("budget only uses allowed expenses and stays within the maximum", () => {
    expect(d.budget.length).toBeGreaterThan(0);
    for (const l of d.budget) expect(beca.allowedExpenses).toContain(l.expenseType);
    expect(d.budget.reduce((s, l) => s + l.amountEur, 0)).toBeLessThanOrEqual(9000);
  });

  it("checklist covers every required document plus Hacienda and Seguridad Social", () => {
    const items = d.checklist.map((c) => c.item);
    for (const doc of beca.requiredDocuments) expect(items).toContain(doc);
    expect(items.join(" ")).toMatch(/Hacienda/);
    expect(items.join(" ")).toMatch(/Seguridad Social/);
  });
});

describe("mock draft (business × digitalización)", () => {
  it("writes company, memoria and objetivos from the profile; budget within allowed expenses", async () => {
    const d = await draftingAi.mock.draftApplication({ profile: fixtureBusiness, call: digital, transcript: [], works: [] });
    expect(d.sections.map((s) => s.key)).toEqual(["company", "memoria", "objetivos"]);
    expect(d.sections[0].body).toContain("Cerámica Mareira");
    for (const l of d.budget) expect(digital.allowedExpenses).toContain(l.expenseType);
    expect(d.budget.reduce((s, l) => s + l.amountEur, 0)).toBeLessThanOrEqual(6000);
  });
});

describe("rules", () => {
  it("fitBudget drops lines outside the bases and scales to the maximum", () => {
    const lines = fitBudget(
      [
        { concept: "Papel", amountEur: 6000, expenseType: "Materiales" },
        { concept: "Viaje", amountEur: 500, expenseType: "viajes" },
        { concept: "Fanzine", amountEur: 6000, expenseType: "edición" },
      ],
      beca,
    );
    expect(lines.map((l) => l.expenseType)).toEqual(["materiales", "edición"]);
    expect(lines.reduce((s, l) => s + l.amountEur, 0)).toBe(9000);
  });

  it("buildChecklist keeps the user's ticks", () => {
    const c = buildChecklist(beca, [{ item: "CV", done: true }]);
    expect(c.find((x) => x.item === "CV")?.done).toBe(true);
  });
});

describe("draftApplication service", () => {
  it("402 without Pro or credit; with Pro it drafts once and reuses the draft", async () => {
    await seedOnboardedCreator();
    await expect(draftApplication({ callId: beca.id, profileId: DEMO_CREATOR_ID }, { caller: "app", appUserId: DEMO_APP_USER_ID })).rejects.toBeInstanceOf(PaymentRequiredError);
    expect(findDraft({ callId: beca.id, profileId: DEMO_CREATOR_ID })).toBeNull();

    await grantPro();
    const a = await draftApplication({ callId: beca.id, profileId: DEMO_CREATOR_ID }, { caller: "app", appUserId: DEMO_APP_USER_ID });
    const b = await draftApplication({ callId: beca.id, profileId: DEMO_CREATOR_ID }, { caller: "app", appUserId: DEMO_APP_USER_ID });
    expect(b.id).toBe(a.id);
    expect(b.version).toBe(1);
    expect(readDb().applications).toHaveLength(1);
    expect(Object.keys(draftSources(a)).length).toBeGreaterThan(0);
  });

  it("an existing draft is returned even after the entitlement is gone (no double credit)", async () => {
    await seedOnboardedCreator();
    await grantPro();
    const a = await draftApplication({ callId: beca.id, profileId: DEMO_CREATOR_ID }, { caller: "app", appUserId: DEMO_APP_USER_ID });
    const again = await draftApplication({ callId: beca.id, profileId: DEMO_CREATOR_ID }, { caller: "app", appUserId: "someone-without-pro" });
    expect(again.id).toBe(a.id);
  });

  it("business profile drafts too", async () => {
    await grantPro();
    const a = await draftApplication({ callId: digital.id, profileId: DEMO_BUSINESS_ID }, { caller: "app", appUserId: DEMO_APP_USER_ID });
    expect(a.sections[0].key).toBe("company");
  });
});

describe("prizes", () => {
  it("a prize or contest without allowed expenses gets no budget", async () => {
    const premio = fixtureCalls.find((c) => c.id === "fixture-premio-ilustracion")!;
    const d = await draftingAi.mock.draftApplication({ profile: fixtureCreator, call: premio, transcript: fixtureTranscript, works: [] });
    expect(d.budget).toEqual([]);
  });
});
