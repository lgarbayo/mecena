/**
 * Onboarding AI slice (WP-01). `real` = Claude (MECENA_MODEL_ONBOARDING, default Haiku 5.5, effort low) with
 * schema-validated output; on any AiError (refusal, unparseable output, API error, timeout) it falls back to the
 * deterministic mock for that turn so the live demo never stalls.
 * Claude returns section patches (append | replace); mergeSectionBody turns them into the full bodies the contract carries.
 */
import type { AiSlice, DossierSection, OnboardingTurnInput, OnboardingTurnResult, ProfilePatch } from "@/contracts";
import { serverEnv } from "@/contracts";
import { AiError, isMockAi, structured, type StructuredRequest } from "@/server/ai/llm";
import { looksGarbled } from "@/server/ai/wording";
import type { ProfileKind } from "@/contracts";
import { sectionTitles } from "./copy";
import { dossierLookQuestion } from "./interview";
import { extractProfilePatch, followUpFor, mockOnboardingTurn } from "./mock";
import { cleanProfilePatch, llmTurnSchema, systemPrompt, userPayload, type LlmTurnLike, type SectionMode } from "./prompt";

/**
 * Per-attempt timeout of a live turn. Haiku measured 1.8 s p50 / 2.9 s p95 (FINDINGS.md 8.1), so 20 s is ~7x p95:
 * only a hung request or a cold schema compile hits it.
 */
export const ONBOARDING_TIMEOUT_MS = 20_000;
/**
 * One SDK retry: the likely transient failures (429/529 overloaded, a reset connection) succeed on a quick second try
 * (~0.5 s backoff), which beats degrading the turn to the deterministic extractor. Bounded by ONBOARDING_DEADLINE_MS.
 */
export const ONBOARDING_MAX_RETRIES = 1;
/**
 * Hard cap for the whole call: 2 attempts x 20 s + backoff, and never longer even if a 429 asks for a long retry-after.
 * Then the mock answers, so the client's TURN_TIMEOUT_MS (60 s, turnQueue.ts) always sees a response.
 */
export const ONBOARDING_DEADLINE_MS = 45_000;
/** A turn's output is a patch (~200-800 tokens measured); 3000 leaves room for a full replace of a long section. */
export const ONBOARDING_MAX_TOKENS = 3000;
/** The warm-up compiles the structured-output grammar of a new schema: that took ~43 s in the manual run. */
export const ONBOARDING_WARMUP_TIMEOUT_MS = 120_000;

/** Model + per-request options for every onboarding call (turns and warm-up). */
export function onboardingModelOptions(): Pick<StructuredRequest<never>, "tier" | "model" | "effort" | "thinking"> {
  const model = serverEnv().modelOnboarding;
  // Haiku: thinking off, as measured in the spike (thinking tokens are output tokens, and output drives latency).
  // Other models keep their default: "disabled" is a 400 on Sonnet 5.5 and Opus 5.5.
  return { tier: "fast", model, effort: "low", ...(/haiku/i.test(model) ? { thinking: "disabled" as const } : {}) };
}

/** Lowercase, no accents, no punctuation, no leading bullet, single spaces. For duplicate checks only. */
export function normaliseText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Non-blank lines (paragraphs and bullets), trimmed. */
const blocksOf = (body: string) =>
  body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

const isBullet = (line: string) => /^\s*[-•*]\s/.test(line);

/**
 * Did an "append" actually carry the whole previous text (the model sent everything)? Then it is a replace.
 * Conservative, because treating a real append as a replace would drop what was written: every previous paragraph is
 * one of the body's paragraphs, or the previous text (4+ words) appears word for word inside the body.
 */
function carriesPrevious(prev: string, body: string): boolean {
  const bodyBlocks = new Set(blocksOf(body).map(normaliseText));
  const prevBlocks = blocksOf(prev).map(normaliseText).filter(Boolean);
  if (prevBlocks.length && prevBlocks.every((b) => bodyBlocks.has(b))) return true;
  const p = normaliseText(prev);
  return p.split(" ").length >= 4 && ` ${normaliseText(body)} `.includes(` ${p} `);
}

export interface MergedSection {
  /** The full section body after this update. */
  body: string;
  /** Paragraphs/bullets this update added or rewrote (not in the previous body). */
  added: string[];
  /** How it was applied: an append that carried the previous text counts as "replace". */
  applied: SectionMode;
}

/**
 * Applies one section patch to the previous body. Rules:
 * - replace (or a missing mode): the body is the new full text.
 * - append to a section that does not exist yet (or is blank): creates it with the body.
 * - append whose body already carries the previous text (see carriesPrevious): treated as replace, unless it adds
 *   nothing new (then no change, so a re-punctuated resend never overwrites the current text).
 * - append: only the paragraphs/bullets not already in the section (normalised compare) are added at the end; a
 *   bullet after a bullet joins the list, anything else starts a new paragraph.
 * Returns undefined when nothing changes (blank body, only repeated paragraphs, or the same text).
 */
export function mergeSectionBody(prev: string | undefined, mode: SectionMode | undefined, body: string): MergedSection | undefined {
  const next = body.trim();
  const before = (prev ?? "").trim();
  if (!next) return undefined;
  const had = new Set(blocksOf(before).map(normaliseText));
  let merged: string;
  let applied: SectionMode;
  const resent = mode === "append" && !!before && carriesPrevious(before, next);
  // An append that only resends what is there (at most re-punctuated) changes nothing: keep the current text.
  if (resent && blocksOf(next).every((l) => had.has(normaliseText(l)))) return undefined;
  if (!before || mode !== "append" || resent) {
    merged = next;
    applied = mode === "append" && !before ? "append" : "replace";
  } else {
    const seen = new Set(had);
    const kept: string[] = [];
    for (const line of next.split("\n")) {
      if (!line.trim()) {
        if (kept.length && kept[kept.length - 1] !== "") kept.push("");
        continue;
      }
      const n = normaliseText(line);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      kept.push(line.trimEnd());
    }
    while (kept.length && kept[kept.length - 1] === "") kept.pop();
    if (!kept.length) return undefined;
    const lastBefore = before.split("\n").at(-1) ?? "";
    const sep = isBullet(lastBefore) && isBullet(kept[0]) ? "\n" : "\n\n";
    merged = before + sep + kept.join("\n");
    applied = "append";
  }
  if (merged === before) return undefined;
  const added = blocksOf(merged).filter((l) => !had.has(normaliseText(l)));
  return { body: merged, added, applied };
}

/** Map Claude's lean output onto the contract: titles, status, timestamps and grounded segment ids. */
export function toTurnResult(input: OnboardingTurnInput, out: LlmTurnLike): OnboardingTurnResult {
  const titles = sectionTitles(input.kind);
  const known = new Set(input.transcript.map((s) => s.id).concat(input.newSegment.id));
  // Chained per key, so two patches to the same section in one turn both apply.
  const current = new Map(input.sections.map((s) => [s.key, s]));
  const updated = new Map<string, DossierSection>();
  const added: string[] = [];
  for (const u of out.sectionUpdates) {
    if (!(u.key in titles)) continue;
    const prev = current.get(u.key);
    const merged = mergeSectionBody(prev?.body, u.mode, u.body);
    if (!merged) continue;
    // Only ids that exist; never lose the provenance the section already had.
    const valid = u.sourceSegmentIds.filter((id) => known.has(id));
    const ids = [...new Set([...(prev?.sourceSegmentIds ?? []), ...(valid.length ? valid : [input.newSegment.id])])];
    const section: DossierSection = { key: u.key, title: prev?.title || titles[u.key], body: merged.body, sourceSegmentIds: ids, status: "draft", updatedAt: input.newSegment.at };
    current.set(u.key, section);
    updated.set(u.key, section);
    added.push(...merged.added);
  }
  const sectionUpdates = [...updated.values()];
  // Every field comes back (required schema): drop the "not said" sentinels ("", [], 0, legalForm "").
  const profilePatch = cleanProfilePatch(out.profilePatch);
  // Backstop: Claude skips "busco/quiero…" needs about half the time (manual run), and matching depends on them.
  // Read the needs from Claude's corrected text (what this turn added to the sections), not from the raw segment, so the
  // person's typos never reach the profile; the raw segment only when Claude wrote nothing (deterministic floor applies).
  // `added` = the appended paragraphs, or the new/rewritten ones of a replace (mergeSectionBody).
  if (!profilePatch.fundingNeeds?.length) {
    const source = added.length ? added.join("\n") : input.newSegment.text;
    const needs = extractProfilePatch(source, input.kind, input.profile).fundingNeeds;
    if (needs?.length) profilePatch.fundingNeeds = needs;
  }
  // The optional dossier-look question is ours, asked once when the core profile becomes complete.
  const before = input.profile;
  const after = {
    ...before,
    ...profilePatch,
    disciplines: [...before.disciplines, ...(profilePatch.disciplines ?? [])],
    fundingNeeds: [...before.fundingNeeds, ...(profilePatch.fundingNeeds ?? [])],
  };
  const look = dossierLookQuestion(input.kind, before, after, input.transcript);
  return { profilePatch, sectionUpdates, followUpQuestion: look ?? followUp(input, out.followUpQuestion, profilePatch, sectionUpdates) };
}

/** Claude's question, unless it came back as mojibake ("ÂżDĂłnde…?"): then the deterministic one for the updated profile. */
function followUp(input: OnboardingTurnInput, asked: string | undefined, profilePatch: ProfilePatch, updates: DossierSection[]): string | undefined {
  const q = asked?.trim();
  if (!q) return undefined;
  if (!looksGarbled(q)) return q;
  const p = input.profile;
  const merged = {
    ...p,
    ...profilePatch,
    disciplines: [...p.disciplines, ...(profilePatch.disciplines ?? [])],
    fundingNeeds: [...p.fundingNeeds, ...(profilePatch.fundingNeeds ?? [])],
    achievements: [...p.achievements, ...(profilePatch.achievements ?? [])],
    education: [...p.education, ...(profilePatch.education ?? [])],
  };
  const keys = new Set([...input.sections, ...updates].map((s) => s.key));
  return followUpFor(input.kind, merged, { hasWorks: keys.has("works") || keys.has("series") });
}

export async function realOnboardingTurn(input: OnboardingTurnInput): Promise<OnboardingTurnResult> {
  try {
    const out = await structured({
      ...onboardingModelOptions(),
      maxTokens: ONBOARDING_MAX_TOKENS,
      timeoutMs: ONBOARDING_TIMEOUT_MS,
      maxRetries: ONBOARDING_MAX_RETRIES,
      deadlineMs: ONBOARDING_DEADLINE_MS,
      system: systemPrompt(input.kind),
      user: userPayload(input),
      schema: llmTurnSchema(input.kind),
    });
    return toTurnResult(input, out);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    console.warn(`[onboarding] Claude failed (${e.reason}): ${e.message}. Using the deterministic extractor for this turn.`);
    return mockOnboardingTurn(input);
  }
}

export const onboardingAi: AiSlice<"onboardingTurn"> = {
  mock: {
    async onboardingTurn(input) {
      return mockOnboardingTurn(input);
    },
  },
  real: {
    onboardingTurn: realOnboardingTurn,
  },
};

const warmed = new Set<ProfileKind>();
/**
 * Fire-and-forget tiny call per kind so the structured-output schema is compiled before the first real turn
 * (the first request with a new schema took ~43 s in the manual run; later ones ~2-3 s). Same model as the turns
 * (grammars are compiled per model), longer timeout, no retry. No-op in mock mode. An unparseable answer still
 * compiled the grammar (the tiny max_tokens can cut the JSON), so only API errors allow another warm-up.
 */
export function warmOnboardingAi(kind: ProfileKind): void {
  if (warmed.has(kind) || isMockAi()) return;
  warmed.add(kind);
  structured({
    ...onboardingModelOptions(),
    maxTokens: 300,
    timeoutMs: ONBOARDING_WARMUP_TIMEOUT_MS,
    maxRetries: 0,
    system: systemPrompt(kind),
    user: "{}",
    schema: llmTurnSchema(kind),
  }).catch((e: unknown) => {
    if (e instanceof AiError && e.reason === "parse") return;
    warmed.delete(kind);
    console.warn(`[onboarding] warm-up failed: ${e instanceof Error ? e.message : String(e)}`);
  });
}
