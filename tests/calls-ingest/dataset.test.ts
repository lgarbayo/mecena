import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { Call } from "@/contracts";
import { normalizeCall, validateCallDataset } from "@/features/normalize";
import { listCalls } from "@/server/store";

const DIR = path.resolve("data/calls");
const raw = JSON.parse(fs.readFileSync(path.join(DIR, "calls.json"), "utf8")) as unknown[];
const calls = raw.map((c) => Call.parse(c));
const GALICIA = ["Galicia", "A Coruña", "Lugo", "Ourense", "Pontevedra"];

describe("data/calls/calls.json (real curated dataset)", () => {
  beforeEach(() => {
    process.env.MECENA_CALLS_DIR = DIR; // the real files, not the fixtures
  });

  it("has enough real calls for both modes and for Galicia", () => {
    expect(calls.length).toBeGreaterThanOrEqual(22);
    expect(calls.filter((c) => c.beneficiaryKinds.includes("creator")).length).toBeGreaterThanOrEqual(12);
    expect(calls.filter((c) => c.beneficiaryKinds.includes("business")).length).toBeGreaterThanOrEqual(8);
    expect(calls.filter((c) => c.region && GALICIA.includes(c.region)).length).toBeGreaterThanOrEqual(8);
  });

  it("every call passes the contract and the store loads all of them", () => {
    expect(listCalls().map((c) => c.id).sort()).toEqual(calls.map((c) => c.id).sort());
  });

  it("ids are unique kebab-case slugs and sources are real https URLs", () => {
    expect(new Set(calls.map((c) => c.id)).size).toBe(calls.length);
    for (const c of calls) {
      expect(c.id, c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(c.sourceUrl, c.id).toMatch(/^https:\/\//);
      expect(c.sourceUrl, c.id).not.toMatch(/example\.(org|com)/);
      if (c.basesUrl) expect(c.basesUrl, c.id).toMatch(/^https:\/\//);
    }
  });

  it("criteria from the bases sum to 100", () => {
    for (const c of calls.filter((x) => x.criteriaSource === "bases")) {
      expect(c.criteria.length, c.id).toBeGreaterThan(0);
      expect(c.criteria.reduce((s, k) => s + k.maxPoints, 0), c.id).toBe(100);
    }
  });

  it("no open call had closed when it was verified; recurring calls carry no invented date", () => {
    for (const c of calls) {
      if (c.status === "open" && c.deadline) expect(c.deadline >= c.verifiedAt, c.id).toBe(true);
      if (c.status === "recurring") {
        expect(c.deadline, c.id).toBeNull();
        // the normaliser must not read last edition's date out of deadlineText
        expect(normalizeCall(c).value.deadline.date, c.id).toBeNull();
      }
    }
  });

  it("passes the data standard with no errors", () => {
    const report = validateCallDataset(calls);
    const errors = report.calls.flatMap((q) => q.warnings.filter((w) => w.severity === "error").map((w) => `${q.id}: ${w.code} ${w.message}`));
    expect(errors).toEqual([]);
  });

  it("normalises territories and disciplines onto the taxonomy", () => {
    for (const c of calls) {
      const { value } = normalizeCall(c);
      expect(value.territories.length, c.id).toBeGreaterThan(0);
      expect(value.disciplines.length, c.id).toBe(c.disciplines.length);
    }
  });
});
