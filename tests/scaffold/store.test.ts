import { describe, expect, it } from "vitest";
import { Db } from "@/contracts";
import { DEMO_BUSINESS_ID, DEMO_CREATOR_ID } from "@/fixtures";
import { getProfile, listCalls, mergeProfile, patchProfile, readDb } from "@/server/store";

describe("store (scaffold)", () => {
  it("starts from the blank creator + fixture business, with no accounts, when no seed exists", () => {
    const db = readDb();
    expect(db.profiles.map((p) => p.id)).toEqual([DEMO_CREATOR_ID, DEMO_BUSINESS_ID]);
    expect(db.profiles.every((p) => !p.ownerId)).toBe(true); // unreachable until an account owns them
    expect(db.users).toEqual([]);
    expect(db.sessions).toEqual([]);
  });

  it("merges array fields without duplicates and overwrites scalars", async () => {
    await patchProfile(DEMO_CREATOR_ID, { displayName: "Antía", disciplines: ["pintura"] });
    const p = await patchProfile(DEMO_CREATOR_ID, { disciplines: ["Pintura", "ilustración"] });
    expect(p.displayName).toBe("Antía");
    expect(p.disciplines).toEqual(["pintura", "ilustración"]);
    expect(mergeProfile(p, { city: "" }).city).toBeUndefined();
  });

  it("a patch can never change who owns a profile", async () => {
    const owned = mergeProfile({ ...getProfile(DEMO_CREATOR_ID), ownerId: "user-a" }, { ownerId: "user-b", id: "x" } as never);
    expect(owned.ownerId).toBe("user-a");
    expect(owned.id).toBe(DEMO_CREATOR_ID);
  });

  it("getProfile needs an explicit id (no global active profile)", () => {
    expect(() => getProfile("")).toThrow(/No encontramos este perfil/);
  });

  it("reads calls from MECENA_CALLS_DIR", () => {
    expect(listCalls().every((c) => c.id.startsWith("fixture-"))).toBe(true);
  });

  it("parses a production-shaped db.json from before accounts (no users/sessions, profiles without ownerId)", () => {
    const legacy = {
      meta: { activeProfileId: "demo-creator", appUserId: "mecena-demo-1234" },
      profiles: [{ id: "demo-creator", kind: "creator", displayName: "Antía", updatedAt: "2026-11-01T00:00:00.000Z" }],
      transcripts: [{ profileId: "demo-creator", segments: [{ id: "seg-1", text: "Hola", source: "voice", at: "2026-11-01T00:00:00.000Z" }] }],
      works: [],
      dossiers: [],
      applications: [],
      juryScores: [],
      entitlements: [{ appUserId: "mecena-demo-1234", pro: true, premiumCredits: 0, source: "mock", updatedAt: "2026-11-01T00:00:00.000Z" }],
      usage: [],
      matchCache: [],
    };
    const db = Db.parse(legacy);
    expect(db.users).toEqual([]);
    expect(db.sessions).toEqual([]);
    expect(db.variantCache).toEqual([]);
    expect(db.profiles[0].ownerId).toBeUndefined();
  });
});
