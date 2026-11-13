/**
 * Content adaptation of a call variant (layer 2, CCR-7). Server-only.
 * - Runs the AI slice (Claude or the deterministic mock) on the base dossier + the rules match (WP-06).
 * - Code guards: criteria ids and `from` keys are clamped to known values; numbers not backed by the user's
 *   facts or the call are flagged (`unsupportedNumbers`); format checks always cover the call's rules.
 * - Cached in Db.variantCache by a hash of everything it depends on (~20 s on the fast model); concurrent
 *   requests for the same key share one generation. Errors fall back to the mock and are not cached.
 */
import { createHash } from "node:crypto";
import type { AdaptDossierResult, Call, DossierSection, DossierVariant, Profile, TranscriptSegment, Work } from "@/contracts";
import { ruleMatch } from "@/features/matching/service";
import { getAi, mockAi } from "@/server/ai";
import { getTranscript, nowIso, readDb, updateDb } from "@/server/store";
import { allowedFrom, formatChecks } from "./adapt-ai";

export type Adaptation = Pick<DossierVariant, "strategy" | "sections" | "omitted" | "questions" | "formatChecks" | "unsupportedNumbers" | "generatedBy" | "generatedAt">;

const digits = (s: string) => s.replace(/\D/g, "");

/** Numbers in the variant bodies that appear nowhere in the facts (placeholders excluded). */
export function unsupportedNumbers(bodies: string[], facts: string): string[] {
  const hay = facts.replace(/(\d)[.\s](?=\d{3}\b)/g, "$1");
  const hayDigits = new Set((hay.match(/\d+/g) ?? []).map(digits));
  const out = new Set<string>();
  for (const b of bodies) {
    const text = b.replace(/\[PENDIENTE:[^\]]*\]/g, "");
    for (const m of text.matchAll(/\d[\d.,]*\d|\d/g)) {
      const raw = m[0];
      const n = digits(raw.replace(/[.,]\d{1,2}$/, "")); // "12.000,50" -> "12000"
      if (n.length < 2) continue; // list numbers, "1 de cada 4"
      if (!hayDigits.has(n) && !hayDigits.has(digits(raw))) out.add(raw);
    }
  }
  return [...out];
}

export function cacheKey(input: { profile: Profile; call: Call; sections: DossierSection[]; works: Work[]; mode: string }): string {
  const h = createHash("sha1");
  h.update(JSON.stringify([input.mode, input.profile.id, input.profile.updatedAt, input.call.id, input.call.verifiedAt]));
  h.update(JSON.stringify(input.sections.map((s) => [s.key, s.body])));
  h.update(JSON.stringify(input.works.map((w) => [w.id, w.sheet])));
  return h.digest("hex").slice(0, 16);
}

function clean(raw: AdaptDossierResult, input: { profile: Profile; call: Call; sections: DossierSection[]; works: Work[]; transcript: TranscriptSegment[] }): Adaptation {
  const ids = new Set(input.call.criteria.map((c) => c.id));
  const from = new Set(allowedFrom(input.profile.kind));
  const sections = raw.sections
    .filter((s) => s.body.trim() && s.heading.trim())
    .map((s, i) => ({
      id: s.id || `s${i + 1}`,
      heading: s.heading.trim(),
      body: s.body.trim(),
      criteria: s.criteria.filter((c) => ids.has(c)),
      from: s.from.filter((f) => from.has(f)),
    }));
  // The model's checks first; then any call rule it skipped (deterministic list).
  const checks = [...raw.formatChecks];
  for (const c of formatChecks(input.call, input.works.length)) if (!checks.some((x) => x.rule.toLowerCase() === c.rule.toLowerCase())) checks.push(c);
  const facts = JSON.stringify([input.profile, input.sections.map((s) => s.body), input.works.map((w) => w.sheet), input.call, input.transcript.map((t) => t.text)]);
  return {
    strategy: raw.strategy.trim(),
    sections,
    omitted: raw.omitted,
    questions: raw.questions.slice(0, 5).map((q) => ({ ...q, criterionId: ids.has(q.criterionId) ? q.criterionId : "" })),
    formatChecks: checks,
    unsupportedNumbers: unsupportedNumbers(sections.map((s) => s.body), facts),
  };
}

const inflight = new Map<string, Promise<Adaptation>>();

export async function adaptVariant(input: { profile: Profile; call: Call; sections: DossierSection[]; works: Work[] }): Promise<Adaptation> {
  const ai = getAi();
  const key = cacheKey({ ...input, mode: ai.mode });
  const hit = readDb().variantCache.find((v) => v.cacheKey === key);
  if (hit) {
    const { strategy, sections, omitted, questions, formatChecks, unsupportedNumbers, generatedBy, generatedAt } = hit;
    return { strategy, sections, omitted, questions, formatChecks, unsupportedNumbers, generatedBy, generatedAt };
  }
  const running = inflight.get(key);
  if (running) return running;

  const job = (async (): Promise<Adaptation> => {
    const transcript = getTranscript(input.profile.id);
    const match = ruleMatch(input.profile, input.call);
    const args = { ...input, transcript, match };
    try {
      const raw = await ai.adaptDossier(args);
      const out: Adaptation = { ...clean(raw, args), generatedBy: ai.mode === "mock" ? "mock" : "ai", generatedAt: nowIso() };
      if (!out.sections?.length) throw new Error("empty adaptation");
      await updateDb((db) => {
        // Notes and limits live in the rules plan (recomputed on every request); the cache keeps only the content.
        db.variantCache = [...db.variantCache.filter((v) => v.cacheKey !== key), { callId: input.call.id, notes: [], cacheKey: key, ...out }].slice(-50);
      });
      return out;
    } catch (e) {
      console.error("[dossier] adaptation failed, using the deterministic version", e);
      const raw = await mockAi().adaptDossier(args);
      return { ...clean(raw, args), generatedBy: "mock", generatedAt: nowIso() };
    }
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}
