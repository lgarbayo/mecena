import { afterEach, describe, expect, it, vi } from "vitest";
import * as aiIndex from "@/server/ai";
import { getDossier, getProfile, getTranscript } from "@/server/store";
import { processTurn, getOnboardingState } from "@/features/onboarding/service";
import { POST } from "@/app/api/onboarding/turn/route";
import { GET } from "@/app/api/onboarding/route";
import { fixtureTranscript } from "@/fixtures";
import { req } from "../helpers";

afterEach(() => vi.restoreAllMocks());

describe("processTurn", () => {
  it("builds profile and dossier across the 3 fixture chunks and reports what changed", async () => {
    const r1 = await processTurn({ text: fixtureTranscript[0].text, source: "voice" });
    expect(r1.changedProfileFields).toEqual(expect.arrayContaining(["displayName", "city", "disciplines"]));
    expect(r1.changedProfileFields).not.toContain("updatedAt");
    expect(r1.changedSectionKeys).toEqual(["bio"]);
    const r2 = await processTurn({ text: fixtureTranscript[1].text, source: "voice" });
    expect(r2.changedSectionKeys).toEqual(["statement"]);
    expect(r2.changedProfileFields).not.toContain("displayName");
    const r3 = await processTurn({ text: fixtureTranscript[2].text, source: "voice" });
    expect(r3.profile.displayName).toBe("Antía Varela");
    expect(r3.sections.map((s) => s.key)).toEqual(["statement", "bio", "series"]); // canonical order
    expect(r3.followUpQuestion).toBeTruthy();
    expect(getDossier(r3.profile.id)?.sections).toHaveLength(3);
    expect(getTranscript(r3.profile.id)).toHaveLength(3);
  });

  it("a slow turn the client gave up on cannot overwrite what later turns saved meanwhile", async () => {
    const mock = aiIndex.mockAi();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    const slow = aiIndex.mockAi();
    slow.onboardingTurn = vi.fn(async (input) => {
      if (calls++ === 0) await gate; // the first run of turn A hangs on the AI
      return mock.onboardingTurn(input);
    });
    vi.spyOn(aiIndex, "getAi").mockReturnValue(slow);
    const a = "Me llamo Antía Varela, soy ilustradora de A Coruña.";
    const b = "Tengo una serie de grabados sobre el mar y busco una residencia artística.";
    const orphan = processTurn({ text: a, source: "voice" }); // A1: the client times out on it...
    await new Promise((r) => setTimeout(r, 0));
    await processTurn({ text: a, source: "voice" }); // ...and retries (A2, same segment)
    const rb = await processTurn({ text: b, source: "voice" }); // then B
    release();
    await orphan; // A1 finally returns
    const id = rb.profile.id;
    expect(getProfile(id).fundingNeeds).toEqual(rb.profile.fundingNeeds);
    expect(getProfile(id).fundingNeeds.length).toBeGreaterThan(0);
    expect(getDossier(id)?.sections.map((s) => [s.key, s.body])).toEqual(rb.sections.map((s) => [s.key, s.body]));
    expect(getTranscript(id).map((s) => s.text)).toEqual([a, b]);
  });

  it("keeps the transcript and falls back to the mock when the AI call fails", async () => {
    const failing = aiIndex.mockAi();
    failing.onboardingTurn = vi.fn().mockRejectedValue(new Error("boom"));
    vi.spyOn(aiIndex, "getAi").mockReturnValue(failing);
    const r = await processTurn({ text: "Me llamo Antía Varela, soy ilustradora de A Coruña.", source: "voice" });
    expect(failing.onboardingTurn).toHaveBeenCalledOnce();
    expect(r.profile.displayName).toBe("Antía Varela");
    expect(getTranscript(r.profile.id).map((s) => s.text)).toEqual(["Me llamo Antía Varela, soy ilustradora de A Coruña."]);
  });

  it("drops section keys that do not belong to the profile kind", async () => {
    const bad = aiIndex.mockAi();
    bad.onboardingTurn = vi.fn().mockResolvedValue({
      profilePatch: {},
      sectionUpdates: [{ key: "figures", title: "Cifras", body: "x", sourceSegmentIds: [], status: "draft", updatedAt: "2026-01-01T00:00:00Z" }],
    });
    vi.spyOn(aiIndex, "getAi").mockReturnValue(bad);
    const r = await processTurn({ text: "Hola", source: "text" });
    expect(r.sections).toEqual([]);
    expect(r.changedSectionKeys).toEqual([]);
  });

  it("a retry of the same chunk after a failure reuses the stored segment (no duplicates)", async () => {
    const r1 = await processTurn({ text: "Soy pintora.", source: "voice" });
    const r2 = await processTurn({ text: "Soy pintora.", source: "voice" });
    expect(r2.segmentId).toBe(r1.segmentId);
    expect(getTranscript(r1.profile.id)).toHaveLength(1);
  });
});

describe("onboarding routes", () => {
  it("POST /api/onboarding/turn validates and returns the turn", async () => {
    const bad = await POST(req("/api/onboarding/turn", { body: { text: "", source: "voice" } }));
    expect(bad.status).toBe(400);
    const ok = await POST(req("/api/onboarding/turn", { body: { text: fixtureTranscript[0].text, source: "voice" } }));
    expect(ok.status).toBe(200);
    const json = await ok.json();
    expect(json.profile.displayName).toBe("Antía Varela");
  });

  it("GET /api/onboarding returns the state to resume", async () => {
    await processTurn({ text: fixtureTranscript[0].text, source: "voice" });
    const res = await GET(req("/api/onboarding"));
    const json = await res.json();
    expect(json.transcript).toHaveLength(1);
    expect(json.sections[0].key).toBe("bio");
    expect(getOnboardingState().profile.id).toBe(getProfile().id);
  });
});
