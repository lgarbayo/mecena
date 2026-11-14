/** Import an existing dossier (CCR-8): mock text path, real path with structured() mocked, merge, route errors. */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ai/llm", async (orig) => {
  const mod = await orig<typeof import("@/server/ai/llm")>();
  return { ...mod, structured: vi.fn(), isMockAi: vi.fn(() => true) };
});

import { isMockAi, structured } from "@/server/ai/llm";
import { importDossier, mergeBody } from "@/features/onboarding/import";
import { POST } from "@/app/api/onboarding/import/route";
import { getDossier, getProfile, getTranscript, uploadsDir } from "@/server/store";
import { fixtureTranscript } from "@/fixtures";
import { nothingSaid, req } from "../helpers";

const mockedStructured = vi.mocked(structured);
const mockedIsMock = vi.mocked(isMockAi);
afterEach(() => {
  mockedStructured.mockReset();
  mockedIsMock.mockReturnValue(true);
});

const PDF = `data:application/pdf;base64,${Buffer.from("%PDF-1.4 fake").toString("base64")}`;

describe("importDossier", () => {
  it("offline: pasted text fills profile and sections through the deterministic extractor", async () => {
    const text = fixtureTranscript.map((s) => s.text).join(" ");
    const res = await importDossier({ text });
    expect(res.mode).toBe("mock");
    expect(res.profile.displayName).toBe("Antía Varela");
    expect(res.changedSectionKeys.length).toBeGreaterThan(0);
    const dossier = getDossier(res.profile.id)!;
    // every imported section is grounded on a transcript segment holding its text
    const segs = getTranscript(res.profile.id);
    for (const s of dossier.sections) expect(s.sourceSegmentIds.every((id) => segs.some((x) => x.id === id))).toBe(true);
    expect(res.segmentIds).toHaveLength(res.changedSectionKeys.length);
  });

  it("offline: a file cannot be read and says so (422)", async () => {
    const r = await POST(req("/api/onboarding/import", { method: "POST", body: { fileDataUrl: PDF } }));
    expect(r.status).toBe(422);
    expect((await r.json()).message).toMatch(/Pega el texto/);
  });

  it("rejects an empty request and unsupported file types", async () => {
    expect((await POST(req("/api/onboarding/import", { method: "POST", body: {} }))).status).toBe(400);
    expect((await POST(req("/api/onboarding/import", { method: "POST", body: { fileDataUrl: "data:application/zip;base64,AAAA" } }))).status).toBe(400);
  });

  it("with AI: sends the PDF as a document block, copies the sections and keeps the original file", async () => {
    mockedIsMock.mockReturnValue(false);
    mockedStructured.mockResolvedValueOnce({
      profilePatch: { displayName: "Antía Varela", city: "A Coruña", disciplines: ["ilustración"], achievements: ["2024 Exposición colectiva, Kiosko Alfonso"] },
      sections: [
        { key: "statement", body: "Pinto a las rederas de mi familia." },
        { key: "cv", body: "- 2024 Exposición colectiva. Kiosko Alfonso" },
        { key: "activity", body: "No es una sección de creador" },
      ],
      worksFound: ["Redeira I, 2025, acuarela, 56 x 76 cm"],
      followUpQuestion: "¿Qué proyecto quieres financiar?",
    });
    const res = await importDossier({ fileDataUrl: PDF, fileName: "dossier.pdf" });
    const call = mockedStructured.mock.calls[0][0];
    const content = call.user as { type: string }[];
    expect(content[0].type).toBe("document");
    expect(res.mode).toBe("ai");
    expect(res.changedSectionKeys).toEqual(["statement", "cv"]); // unknown keys dropped
    expect(res.worksFound).toHaveLength(1);
    expect(res.followUpQuestion).toMatch(/proyecto/);
    expect(res.profile.city).toBe("A Coruña");
    expect(fs.existsSync(path.join(uploadsDir(), `dossier-import-${res.profile.id}.pdf`))).toBe(true);
  });

  it("with AI: a photo goes as an image block", async () => {
    mockedIsMock.mockReturnValue(false);
    mockedStructured.mockResolvedValueOnce({ profilePatch: {}, sections: [], worksFound: [], followUpQuestion: "¿?" });
    await importDossier({ fileDataUrl: "data:image/jpeg;base64,/9j/AAAA" });
    expect((mockedStructured.mock.calls[0][0].user as { type: string }[])[0].type).toBe("image");
  });
});

describe("importDossier sentinels", () => {
  it("with AI: the required-field sentinels never reach the profile", async () => {
    mockedIsMock.mockReturnValue(false);
    mockedStructured.mockResolvedValueOnce({ profilePatch: { ...nothingSaid("creator"), city: "Lugo" }, sections: [], worksFound: [], followUpQuestion: "¿?" });
    const before = getProfile();
    const res = await importDossier({ text: "Vivo en Lugo." });
    expect(res.profile.city).toBe("Lugo");
    expect(res.profile.displayName).toBe(before.displayName);
    expect(res.profile.birthYear).toBe(before.birthYear);
    expect(res.changedProfileFields).toContain("city");
    for (const k of ["displayName", "birthYear", "disciplines", "achievements"]) expect(res.changedProfileFields).not.toContain(k);
  });
});

describe("mergeBody", () => {
  it("adds only the paragraphs that are not already there", () => {
    expect(mergeBody(undefined, " Nuevo. ")).toBe("Nuevo.");
    expect(mergeBody("A.\n\nB.", "B.\n\nC.")).toBe("A.\n\nB.\n\nC.");
  });
});
