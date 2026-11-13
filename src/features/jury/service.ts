// Owned by WP-08. Simulated jury: 3 judges in parallel on the call's official criteria (or estimated ones),
// scores clamped and averaged, normalised to 100. "Aplicar mejoras" revises from the user's facts and re-scores.
import type { Application, JudgePersona, JuryScore } from "@/contracts";
import { getAi } from "@/server/ai";
import { getApplication, getCall, getProfile, getTranscript, listJuryScores, newId, nowIso, saveApplication, saveJuryScore } from "@/server/store";
import { CREATOR_JUDGES, criteriaFor, judgesFor } from "./rules";

/** Default personas (creator calls); business applications use BUSINESS_JUDGES (see ./rules). */
export const JUDGES: JudgePersona[] = CREATOR_JUDGES;
export { BUSINESS_JUDGES, CREATOR_JUDGES, judgesFor } from "./rules";

const DISCLAIMER = "Simulación orientativa con los criterios oficiales de las bases. No predice la resolución real.";
const DISCLAIMER_ESTIMATED = "Simulación orientativa: las bases no publican criterios puntuados, así que usamos criterios estimados. No predice la resolución real.";

export async function scoreApplication(applicationId: string): Promise<JuryScore> {
  const application = getApplication(applicationId);
  const rawCall = getCall(application.callId);
  const kind = getProfile(application.profileId).kind;
  const { criteria: callCriteria, estimated } = criteriaFor(rawCall, kind);
  const call = { ...rawCall, criteria: callCriteria };
  const judges = judgesFor(kind);
  const verdicts = await Promise.all(judges.map((judge) => getAi().judgeApplication({ call, application, judge })));

  const criteria = call.criteria.map((c) => {
    const byJudge = verdicts.map((v, i) => {
      const s = v.scores.find((x) => x.criterionId === c.id);
      return { judgeId: judges[i].id, points: Math.max(0, Math.min(c.maxPoints, s?.points ?? 0)), comment: s?.comment ?? "" };
    });
    const points = Math.round((byJudge.reduce((a, b) => a + b.points, 0) / Math.max(1, byJudge.length)) * 10) / 10;
    const fixes = [...new Set(verdicts.flatMap((v) => v.scores.find((x) => x.criterionId === c.id)?.fixes ?? []))].slice(0, 3);
    return { criterionId: c.id, name: c.name, maxPoints: c.maxPoints, byJudge, points, fixes };
  });
  const max = call.criteria.reduce((a, c) => a + c.maxPoints, 0) || 100;
  const total = Math.max(0, Math.min(100, Math.round((criteria.reduce((a, c) => a + c.points, 0) / max) * 100)));
  const summary = [...new Set(verdicts.map((v) => v.overall).filter(Boolean))].join(" ");

  return saveJuryScore({
    id: newId("score"),
    applicationId,
    applicationVersion: application.version,
    judges,
    criteria,
    total,
    summary,
    disclaimer: estimated ? DISCLAIMER_ESTIMATED : DISCLAIMER,
    createdAt: nowIso(),
  });
}

export async function improveApplication(input: { applicationId: string; scoreId: string; fixes?: string[] }): Promise<{ application: Application; score: JuryScore; previous?: JuryScore }> {
  const application = getApplication(input.applicationId);
  const rawCall = getCall(application.callId);
  const kind = getProfile(application.profileId).kind;
  const call = { ...rawCall, criteria: criteriaFor(rawCall, kind).criteria };
  const previous = listJuryScores(application.id).find((s) => s.id === input.scoreId);
  const fixes = input.fixes ?? previous?.criteria.flatMap((c) => c.fixes) ?? [];
  const revised = await getAi().reviseApplication({ call, application, transcript: getTranscript(application.profileId), fixes });
  const next = await saveApplication({ ...application, ...revised, version: application.version + 1, status: "reviewed", updatedAt: nowIso() });
  const score = await scoreApplication(next.id);
  return { application: next, score, previous };
}
