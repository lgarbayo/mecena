import { describe, expect, it } from "vitest";
import { DEMO_BUSINESS_ID, DEMO_CREATOR_ID } from "@/fixtures";
import { getActiveProfile, listCalls, mergeProfile, patchProfile, readDb, setActiveMode } from "@/server/store";

describe("store (scaffold)", () => {
  it("starts from the blank creator + fixture business when no seed exists", () => {
    const db = readDb();
    expect(db.meta.activeProfileId).toBe(DEMO_CREATOR_ID);
    expect(db.profiles.map((p) => p.id)).toEqual([DEMO_CREATOR_ID, DEMO_BUSINESS_ID]);
  });

  it("merges array fields without duplicates and overwrites scalars", async () => {
    await patchProfile(undefined, { displayName: "Antía", disciplines: ["pintura"] });
    const p = await patchProfile(undefined, { disciplines: ["Pintura", "ilustración"] });
    expect(p.displayName).toBe("Antía");
    expect(p.disciplines).toEqual(["pintura", "ilustración"]);
    expect(mergeProfile(p, { city: "" }).city).toBeUndefined();
  });

  it("switches creator <-> business mode", async () => {
    await setActiveMode("business");
    expect(getActiveProfile().kind).toBe("business");
  });

  it("reads calls from MECENA_CALLS_DIR", () => {
    expect(listCalls().every((c) => c.id.startsWith("fixture-"))).toBe(true);
  });
});
