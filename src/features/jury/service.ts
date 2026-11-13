// STUB (scaffold, working baseline). Owned by WP-09.
import type { Application, JudgePersona, JuryScore } from "@/contracts";
import { getAi } from "@/server/ai";
import { getApplication, getCall, getTranscript, listJuryScores, newId, nowIso, saveApplication, saveJuryScore } from "@/server/store";

export const JUDGES: JudgePersona[] = [
  { id: "tecnica", name: "Técnica de la administración", focus: "Cumplimiento de las bases, presupuesto y documentación" },
  { id: "comisaria", name: "Comisaria independiente", focus: "Calidad, originalidad y coherencia del proyecto" },
  { id: "gestor", name: "Gestor cultural", focus: "Impacto, público y viabilidad" },
];

export async function scoreApplication(applicationId: string): Promise<JuryScore> {
  const application = getApplication(applicationId);
  const call = getCall(application.callId);
  const verdicts = await Promise.all(JUDGES.map((judge) => getAi().judgeApplication({ call, application, judge })));
  const criteria = call.criteria.map((c) => {
    const byJudge = verdicts.map((v) => {
      const s = v.scores.find((x) => x.criterionId === c.id);
      return { judgeId: v.judgeId, points: Math.min(c.maxPoints, s?.points ?? 0), comment: s?.comment ?? "" };
    });
    const points = byJudge.reduce((a, b) => a + b.points, 0) / Math.max(1, byJudge.length);
    const fixes = verdicts.flatMap((v) => v.scores.find((x) => x.criterionId === c.id)?.fixes ?? []);
    return { criterionId: c.id, name: c.name, maxPoints: c.maxPoints, byJudge, points, fixes };
  });
  const max = call.criteria.reduce((a, c) => a + c.maxPoints, 0) || 100;
  const total = Math.round((criteria.reduce((a, c) => a + c.points, 0) / max) * 100);
  return saveJuryScore({
    id: newId("score"),
    applicationId,
    applicationVersion: application.version,
    judges: JUDGES,
    criteria,
    total,
    summary: verdicts.map((v) => v.overall).filter(Boolean).join(" "),
    disclaimer: "Simulación orientativa con los criterios oficiales de las bases. No predice la resolución real.",
    createdAt: nowIso(),
  });
}

export async function improveApplication(input: { applicationId: string; scoreId: string; fixes?: string[] }): Promise<{ application: Application; score: JuryScore; previous?: JuryScore }> {
  const application = getApplication(input.applicationId);
  const call = getCall(application.callId);
  const previous = listJuryScores(application.id).find((s) => s.id === input.scoreId);
  const fixes = input.fixes ?? previous?.criteria.flatMap((c) => c.fixes) ?? [];
  const revised = await getAi().reviseApplication({ call, application, transcript: getTranscript(application.profileId), fixes });
  const next = await saveApplication({ ...application, ...revised, version: application.version + 1, status: "reviewed", updatedAt: nowIso() });
  const score = await scoreApplication(next.id);
  return { application: next, score, previous };
}
