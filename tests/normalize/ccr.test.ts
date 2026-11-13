import { describe, expect, it } from "vitest";
import { Call, ProfilePatch } from "@/contracts";
import { fixtureBusiness, fixtureCreator, blankCreator } from "@/fixtures";
import { evaluateEligibility, normalizeCall, normalizeProfile, withCanonicalCallFields } from "@/features/normalize";
import { mergeProfile, withCanonicalFields } from "@/server/store";
import calls from "../../data/calls/calls.json";
import { makeCall } from "./helpers";

describe("CCR-1/3: canonical territory and beneficiary types on Profile", () => {
  it("the store derives them when onboarding fills city and legal form", () => {
    const p = mergeProfile(blankCreator, { city: "Coruña (A)", region: "Galicia" });
    expect(p.territory).toBe("mun:15030");
    expect(p.beneficiaryTypes).toEqual(["persona-fisica"]);
    const autonomo = mergeProfile(p, { legalForm: "autonomo" });
    expect(autonomo.beneficiaryTypes).toEqual(["autonomo"]);
  });

  it("drops a stale territory when the place is cleared or unknown", () => {
    const p = withCanonicalFields({ ...fixtureCreator, city: undefined, province: undefined, region: undefined });
    expect(p.territory).toBeUndefined();
  });

  it("is not part of the AI patch: derived fields cannot be written directly", () => {
    expect(Object.keys(ProfilePatch.shape)).not.toContain("territory");
    expect(Object.keys(ProfilePatch.shape)).not.toContain("beneficiaryTypes");
  });

  it("normalizeProfile prefers the stored ids", () => {
    const p = normalizeProfile({ ...fixtureCreator, city: "Ningunsitio", territory: "ES111", beneficiaryTypes: ["autonomo"] }).value;
    expect(p.territory).toBe("ES111");
    expect(p.beneficiaryTypes).toEqual(["autonomo"]);
  });

  it("normalizeProfile ignores an unknown stored territory and falls back to the text", () => {
    expect(normalizeProfile({ ...fixtureBusiness, territory: "XX999" }).value.territory).toBe("mun:27028");
  });
});

describe("CCR-5/6: canonical territories and beneficiary types on Call", () => {
  it("stored territories are the source of truth over residence text", () => {
    const c = makeCall({ territories: ["ES11"], eligibility: { residence: ["Madrid"] } });
    expect(normalizeCall(c).value.territories).toEqual(["ES11"]);
  });

  it("withCanonicalCallFields stores only explicit sources", () => {
    const stateWide = withCanonicalCallFields(makeCall());
    expect(stateWide.territories).toEqual([]); // [] = state-wide
    expect(stateWide.beneficiaryTypes).toEqual([]); // kinds-only = left to normalizeCall
    const galicia = withCanonicalCallFields(makeCall({ eligibility: { residence: ["Galiza"], legalForms: ["autónomo", "pyme"] } }));
    expect(galicia.territories).toEqual(["ES11"]);
    expect(galicia.beneficiaryTypes).toEqual(["autonomo", "pyme"]);
  });

  it("every call in data/calls/calls.json is backfilled and stable", () => {
    for (const raw of calls as unknown[]) {
      const c = Call.parse(raw);
      expect(withCanonicalCallFields(c), c.id).toEqual(c);
      if (c.eligibility.residence.length) expect(c.territories.length, c.id).toBeGreaterThan(0);
      if (c.eligibility.legalForms.length) expect(c.beneficiaryTypes.length, c.id).toBeGreaterThan(0);
    }
  });

  it("a call open to 'España' no longer excludes a Galician artist", () => {
    const getxo = Call.parse((calls as { id: string }[]).find((c) => c.id === "getxo-novela-corta-ramiro-pinilla-2027"));
    const r = evaluateEligibility(normalizeProfile(fixtureCreator).value, normalizeCall(getxo).value, { today: "2026-11-13" });
    expect(r.checks.find((k) => k.rule === "territory")?.result).toBe("pass");
  });
});
