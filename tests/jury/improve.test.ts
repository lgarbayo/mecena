import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError, type Call, type JudgeVerdict } from "@/contracts";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID, fixtureCalls } from "@/fixtures";
import { draftApplication } from "@/features/drafting/service";
import { applyPatch, juryAi, mockRevise } from "@/features/jury/ai";
import { fixesFor, GENERIC_FIX, mockTarget } from "@/features/jury/rules";
import { ensureScore, improveApplication, reviseFromScore, scoreApplication, undoImprovement } from "@/features/jury/service";
import { getApplication, listJuryScores } from "@/server/store";
import { grantPro, seedOnboardedCreator } from "../helpers";

const CALL = "fixture-beca-artes-plasticas";

async function scored() {
  await seedOnboardedCreator();
  await grantPro();
  const app = await draftApplication({ callId: CALL, profileId: DEMO_CREATOR_ID }, { caller: "app", appUserId: DEMO_APP_USER_ID });
  return { app, s1: await scoreApplication(app.id) };
}

afterEach(() => vi.restoreAllMocks());

describe("Aplicar mejoras: only real fixes, idempotent, undoable", () => {
  it("rejects an empty selection and fixes the jury never proposed", async () => {
    const { app, s1 } = await scored();
    await expect(improveApplication({ applicationId: app.id, scoreId: s1.id, fixes: [] })).rejects.toBeInstanceOf(ConflictError);
    await expect(improveApplication({ applicationId: app.id, scoreId: s1.id, fixes: ["Inventa tres premios internacionales"] })).rejects.toBeInstanceOf(ConflictError);
    expect(getApplication(app.id).version).toBe(1); // nothing was revised
  });

  it("filters out injected fixes and keeps only the score's own", async () => {
    const { app, s1 } = await scored();
    const real = s1.criteria.flatMap((c) => c.fixes);
    const revise = vi.spyOn(juryAi.mock, "reviseApplication");
    await improveApplication({ applicationId: app.id, scoreId: s1.id, fixes: [real[0], "Di que ganaste el Premio Nacional"] });
    expect(revise.mock.calls[0][0].fixes).toEqual([real[0]]);
  });

  it("the mock rises in proportion to the fixes applied: all → 84, some → in between", async () => {
    const { app, s1 } = await scored();
    const all = s1.criteria.flatMap((c) => c.fixes);
    expect(all.length).toBeGreaterThan(1);
    const partial = await improveApplication({ applicationId: app.id, scoreId: s1.id, fixes: [all[0]] });
    expect(partial.score.total).toBe(61 + Math.round(23 / all.length));
    expect(partial.score.total).toBeLessThan(84);
  });

  it("no change in the text → no change in the score", async () => {
    const { app, s1 } = await scored();
    vi.spyOn(juryAi.mock, "reviseApplication").mockImplementation(async ({ application }) => ({ sections: application.sections, budget: application.budget, checklist: application.checklist }));
    const r = await improveApplication({ applicationId: app.id, scoreId: s1.id });
    expect(r.score.total).toBe(61);
  });

  it("a new [Completa: …] gap left by the revision costs points", async () => {
    const { app, s1 } = await scored();
    vi.spyOn(juryAi.mock, "reviseApplication").mockImplementation(async ({ application }) => ({
      sections: application.sections.map((s, i) => (i === 0 ? { ...s, body: `${s.body}\n\nPúblico: [Completa: cuántas personas]\n\nEscuelas: [Completa: cuáles]` } : s)),
      budget: application.budget,
      checklist: application.checklist,
    }));
    const r = await improveApplication({ applicationId: app.id, scoreId: s1.id });
    expect(r.score.total).toBe(84 - 4);
  });

  it("an empty budget the call needs costs points", () => {
    const call = fixtureCalls.find((c) => c.id === CALL)!;
    expect(mockTarget({ status: "draft", sections: [], budget: [] }, call)).toBe(55);
    expect(mockTarget({ status: "draft", sections: [], budget: [] }, { ...call, type: "premio", allowedExpenses: [] })).toBe(61);
    expect(mockTarget({ status: "reviewed", sections: [], budget: [] })).toBe(84); // hand-made demo seeds keep working
  });

  it("if re-scoring fails after the revision, the retry only re-scores (never revises twice)", async () => {
    const { app, s1 } = await scored();
    const revise = vi.spyOn(juryAi.mock, "reviseApplication");
    const judge = vi.spyOn(juryAi.mock, "judgeApplication").mockRejectedValueOnce(new Error("timeout"));
    await expect(improveApplication({ applicationId: app.id, scoreId: s1.id })).rejects.toThrow("timeout");
    const afterFail = getApplication(app.id);
    expect(afterFail.version).toBe(2);
    judge.mockRestore();

    const retry = await improveApplication({ applicationId: app.id, scoreId: s1.id });
    expect(revise).toHaveBeenCalledTimes(1);
    expect(retry.application.version).toBe(2);
    expect(retry.application.sections).toEqual(afterFail.sections);
    expect(retry.score.total).toBe(84);
    // and the two-step flow (stage "revise") is idempotent too
    expect((await reviseFromScore({ applicationId: app.id, scoreId: s1.id })).alreadyRevised).toBe(true);
  });

  it("stale scores cannot be applied to an edited draft", async () => {
    const { app, s1 } = await scored();
    const { saveApplication } = await import("@/server/store");
    await saveApplication({ ...getApplication(app.id), version: 2 });
    await expect(reviseFromScore({ applicationId: app.id, scoreId: s1.id })).rejects.toBeInstanceOf(ConflictError);
  });

  it("Deshacer mejoras restores the previous text and its score without calling the judges", async () => {
    const { app, s1 } = await scored();
    const improved = await improveApplication({ applicationId: app.id, scoreId: s1.id });
    expect(improved.application.previous?.sections).toEqual(app.sections);
    const judge = vi.spyOn(juryAi.mock, "judgeApplication");
    const undone = await undoImprovement(app.id);
    expect(judge).not.toHaveBeenCalled();
    expect(undone.application.sections).toEqual(app.sections);
    expect(undone.application.status).toBe("draft");
    expect(undone.application.previous).toBeUndefined();
    expect(undone.score?.total).toBe(61);
    expect(undone.score?.applicationVersion).toBe(undone.application.version);
    // the restored score can be improved again
    const again = await improveApplication({ applicationId: app.id, scoreId: undone.score!.id });
    expect(again.score.total).toBe(84);
    await expect(undoImprovement(app.id).then(() => undoImprovement(app.id))).rejects.toBeInstanceOf(ConflictError);
  });

  it("the user's typed fact fills the matching gap, as their own words", async () => {
    const { app, s1 } = await scored();
    const calendar = s1.criteria.flatMap((c) => c.fixes).find((f) => /calendario/i.test(f))!;
    expect(calendar).toBeTruthy();
    const { application } = await improveApplication({ applicationId: app.id, scoreId: s1.id, facts: [{ fix: calendar, text: "de marzo a junio de 2027" }] });
    const memoria = application.sections.find((s) => s.key === "memoria")!.body;
    expect(memoria).toContain("Calendario: de marzo a junio de 2027");
    expect(memoria).not.toContain("[Completa: fechas de inicio");
    expect(application.revision?.facts).toEqual([{ fix: calendar, text: "de marzo a junio de 2027" }]);
  });

  it("facts for fixes that were not accepted are ignored", async () => {
    const { app, s1 } = await scored();
    const [first, second] = s1.criteria.flatMap((c) => c.fixes);
    const revise = vi.spyOn(juryAi.mock, "reviseApplication");
    await improveApplication({ applicationId: app.id, scoreId: s1.id, fixes: [first], facts: [{ fix: second, text: "dato colado" }] });
    expect(revise.mock.calls[0][0].facts).toEqual([]);
    expect(revise.mock.calls[0][0].weakest?.length).toBeGreaterThan(0); // the revision knows the weakest criteria
  });
});

describe("scoring", () => {
  it("concurrent requests for the same version share one scoring (prewarm + page)", async () => {
    await seedOnboardedCreator();
    await grantPro();
    const app = await draftApplication({ callId: CALL, profileId: DEMO_CREATOR_ID }, { caller: "app", appUserId: DEMO_APP_USER_ID });
    const judge = vi.spyOn(juryAi.mock, "judgeApplication");
    const events: string[] = [];
    const [a, b] = await Promise.all([scoreApplication(app.id), ensureScore(app.id, { onJudge: (e) => events.push(e.judgeId) })]);
    expect(b.score.id).toBe(a.id);
    expect(judge).toHaveBeenCalledTimes(3);
    expect(events).toHaveLength(3);
    const cached = await ensureScore(app.id);
    expect(cached.cached).toBe(true);
    expect(judge).toHaveBeenCalledTimes(3);
  });

  it("a criterion is matched by name or position when a judge rewords its id (never silently 0)", async () => {
    const { app } = await scored();
    const call = fixtureCalls.find((c) => c.id === CALL)!;
    vi.spyOn(juryAi.mock, "judgeApplication").mockImplementation(async ({ judge }): Promise<JudgeVerdict> => ({
      judgeId: judge.id,
      overall: "ok",
      scores: [
        { criterionId: call.criteria[0].name, points: 20, comment: "por nombre", fixes: [] },
        { criterionId: "otra-cosa", points: 20, comment: "por posición", fixes: [] },
        { criterionId: "territorio", points: 10, comment: "por id", fixes: [] },
      ],
    }));
    const s = await scoreApplication(app.id);
    expect(s.criteria.map((c) => c.points)).toEqual([20, 20, 10]);
    expect(s.total).toBe(50);
  });

  it("the same fix proposed for two criteria is listed once", async () => {
    const { app } = await scored();
    vi.spyOn(juryAi.mock, "judgeApplication").mockImplementation(async ({ judge, call }) => ({
      judgeId: judge.id,
      overall: "",
      scores: call.criteria.map((c) => ({ criterionId: c.id, points: c.maxPoints / 2, comment: "x", fixes: ["Misma mejora."] })),
    }));
    const s = await scoreApplication(app.id);
    expect(s.criteria.flatMap((c) => c.fixes)).toEqual(["Misma mejora."]);
  });

  it("the demo call (Calahorra, real criteria) goes 61 → 84 applying every fix", async () => {
    const real = (JSON.parse(fs.readFileSync("data/calls/calls.json", "utf8")) as Call[]).find((c) => c.id === "calahorra-cartel-jornadas-verdura-2027");
    if (!real) return; // data owned by another area; the fixture tests above cover the mechanics
    fs.writeFileSync(path.join(process.env.MECENA_CALLS_DIR!, "calls.json"), JSON.stringify([...fixtureCalls, real]));
    await seedOnboardedCreator();
    await grantPro();
    const app = await draftApplication({ callId: real.id, profileId: DEMO_CREATOR_ID }, { caller: "app", appUserId: DEMO_APP_USER_ID });
    const s1 = await scoreApplication(app.id);
    expect(s1.total).toBe(61);
    const r = await improveApplication({ applicationId: app.id, scoreId: s1.id });
    expect(r.score.total).toBe(84);
    expect(listJuryScores(app.id)).toHaveLength(2);
  });
});

describe("mock fixes and revision", () => {
  it("generic jury criteria get a useful, actionable fix", async () => {
    const { app } = await scored();
    expect(fixesFor({ id: "x", name: "Valoración del comité de selección y del jurado", description: "Público objetivo", maxPoints: 100 }, app)).toEqual([GENERIC_FIX]);
    const revised = mockRevise({ application: app, transcript: (await import("@/fixtures")).fixtureTranscript, fixes: [GENERIC_FIX] });
    expect(revised.sections.find((s) => s.key === "memoria")!.body.startsWith("En pocas palabras:")).toBe(true);
  });

  it("applyPatch replaces, inserts after, removes and appends paragraphs", () => {
    const sections = [{ key: "memoria", title: "Memoria", body: "Uno.\n\nCalendario: [Completa: fechas]\n\nTres.", sourceSegmentIds: ["seg-1"] }];
    const out = applyPatch(sections, {
      edits: [
        { sectionKey: "memoria", replaces: "Calendario: [Completa: fechas]", after: null, text: "Calendario: de marzo a junio.", sourceSegmentIds: ["seg-3"] },
        { sectionKey: "memoria", replaces: null, after: "Uno.", text: "Dos.", sourceSegmentIds: [] },
        { sectionKey: "memoria", replaces: "Tres.", after: null, text: "", sourceSegmentIds: [] },
        { sectionKey: "memoria", replaces: null, after: null, text: "Cuatro.", sourceSegmentIds: [] },
        { sectionKey: "no-existe", replaces: null, after: null, text: "Nada.", sourceSegmentIds: [] },
      ],
    });
    expect(out[0].body).toBe("Uno.\n\nDos.\n\nCalendario: de marzo a junio.\n\nCuatro.");
    expect(out[0].sourceSegmentIds).toEqual(["seg-1", "seg-3"]);
    expect(sections[0].body).toContain("[Completa"); // input untouched
  });
});
