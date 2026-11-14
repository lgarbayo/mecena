import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Profile } from "@/contracts";
import { FIXTURE_NOW, fixtureBusiness, fixtureCreator } from "@/fixtures";
import { fitLabel } from "@/features/matching/labels";
import { evaluate } from "@/features/matching/rules";
import { searchCalls } from "@/features/matching/service";
import { listCalls, saveProfile } from "@/server/store";

// Honest scores on the real dataset (data/calls/calls.json): the score measures fit, so a call whose bases the engine
// cannot check against the profile ("Confírmalo") never reads as a sure thing, and none of those requirements is hidden.
const now = new Date(FIXTURE_NOW);

const creator = (p: Partial<Profile>): Profile => ({ ...structuredClone(fixtureCreator), achievements: [], fundingNeeds: [], projectIdea: undefined, bio: "", statement: "", ...p });
const business = (p: Partial<Profile>): Profile => ({ ...structuredClone(fixtureBusiness), ...p });

const personas: Profile[] = [
  creator({ id: "t-pintora", city: "Vigo", province: "Pontevedra", region: "Galicia", birthYear: 1981, disciplines: ["pintura"], statement: "pintura al óleo, paisaje", projectIdea: "exponer mi obra" }),
  creator({ id: "t-fotografa", city: "Madrid", province: "Madrid", region: "Comunidad de Madrid", birthYear: 2001, disciplines: ["fotografía"], statement: "fotografía documental" }),
  creator({ id: "t-poeta", city: "Sevilla", province: "Sevilla", region: "Andalucía", birthYear: 1976, disciplines: ["poesía", "narrativa"], statement: "poesía y novela" }),
  creator({ id: "t-ceramista", city: "Lugo", province: "Lugo", region: "Galicia", birthYear: 1996, disciplines: ["cerámica"], statement: "cerámica y vajilla" }),
  business({ id: "t-panaderia", legalForm: "sl", city: "Pontevedra", province: "Pontevedra", region: "Galicia", sector: "panadería", cnae: "1071", employees: 3, fundingNeeds: ["horno nuevo"] }),
  business({ id: "t-carpintero", legalForm: "autonomo", city: "A Coruña", province: "A Coruña", region: "Galicia", sector: "carpintería", employees: 0 }),
];

const unconfirmed = (miss: string[]) => miss.filter((m) => m.startsWith("Confírmalo")).length;
// Age and staff sentences are checked by their own rule (and reported there), not repeated as "Confírmalo".
const AGE_OR_STAFF = /años|edad|empleados|trabajador|plantilla|personas en/i;

describe("score vs unconfirmed requirements (real dataset)", () => {
  beforeEach(async () => {
    fs.copyFileSync(path.resolve("data/calls/calls.json"), path.join(process.env.MECENA_CALLS_DIR!, "calls.json"));
    for (const p of personas) await saveProfile(structuredClone(p));
  });

  it("3 or more open requirements cap the call at 'medio', 5 or more at 'bajo'; the parts still add up to the score", () => {
    let checked = 0;
    for (const p of personas)
      for (const call of listCalls()) {
        const r = evaluate(p, call, { now });
        if (!r.match.eligible) continue;
        const n = unconfirmed(r.match.whatYouMiss);
        if (n >= 3) expect(r.match.score, `${p.id} × ${call.id} (${n})`).toBeLessThanOrEqual(69);
        if (n >= 5) expect(r.match.score, `${p.id} × ${call.id} (${n})`).toBeLessThanOrEqual(54);
        expect(Object.values(r.breakdown).reduce((s, x) => s + x, 0), `${p.id} × ${call.id}`).toBe(r.match.score);
        checked++;
      }
    expect(checked).toBeGreaterThan(50);
  });

  it("every free-text requirement of a call is listed, none is cut off", () => {
    let calls = 0;
    for (const p of personas)
      for (const call of listCalls()) {
        const others = call.eligibility.other.filter((o) => !AGE_OR_STAFF.test(o));
        if (others.length < 3) continue; // the old cut-off was at 2
        const r = evaluate(p, call, { now });
        if (!r.match.eligible) continue;
        for (const o of others) expect(r.match.whatYouMiss, `${p.id} × ${call.id}`).toContain(`Confírmalo: ${o}`);
        calls++;
      }
    expect(calls).toBeGreaterThan(0);
  });

  it("a painter does not get 'alto' for a call that asks for a 1.5 m street-art piece she never said she makes", () => {
    const pintora = personas[0];
    const r = evaluate(pintora, listCalls().find((c) => c.id === "premios-que-arte-2026")!, { now });
    expect(r.match.whatYouMiss.join(" ")).toMatch(/1,5 m/);
    expect(fitLabel(r.match.score)).not.toBe("alto");
  });

  it("a profile with no on-topic call gets an empty feed, not filler (a ceramist: the dataset has no ceramics call)", async () => {
    const feed = await searchCalls({ profileId: "t-ceramista", now });
    expect(feed.filter((r) => r.call.status !== "recurring")).toEqual([]);
  });
});
