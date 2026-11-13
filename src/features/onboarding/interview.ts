/**
 * Interview flow shared by the mock and the real Claude turn: which art family the creator is in,
 * when the core profile is complete, and the one optional "how do you imagine your dossier" question.
 */
import type { Profile, ProfileKind, TranscriptSegment } from "@/contracts";
import { DOSSIER_LOOK_QUESTION } from "./copy";

type Core = Pick<Profile, "displayName" | "city" | "disciplines" | "projectIdea" | "fundingNeeds">;

/** The common core a jury needs first: who, where, which art, and what they want funding for. */
export function creatorCoreFilled(p: Core): boolean {
  return !!p.displayName && !!p.city && p.disciplines.length > 0 && (!!p.projectIdea || p.fundingNeeds.length > 0);
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** A sentence about how the dossier should look ("me lo imagino sobrio", "un dossier con mucha imagen"). */
export function isDossierLookSentence(sentence: string): boolean {
  const n = fold(sentence);
  if (/\b(me lo imagino|lo imagino|me imagino (el|mi) dossier)\b/.test(n)) return true;
  return /\bdossier\b/.test(n) && /\b(sobri\w*|fanzine|imagen(es)?|minimal\w*|color(es)?|elegante|limpio|estilo|tipografia|letra|blanco y negro|portada)\b/.test(n);
}

/**
 * The optional dossier-look question, asked exactly once: on the turn the creator's core profile becomes
 * complete, unless they already talked about their dossier's look. Never blocks: the next turn moves on.
 */
export function dossierLookQuestion(kind: ProfileKind, before: Core, after: Core, transcript: readonly TranscriptSegment[]): string | undefined {
  if (kind !== "creator") return undefined;
  if (creatorCoreFilled(before) || !creatorCoreFilled(after)) return undefined;
  if (transcript.some((s) => isDossierLookSentence(s.text))) return undefined;
  return DOSSIER_LOOK_QUESTION;
}
