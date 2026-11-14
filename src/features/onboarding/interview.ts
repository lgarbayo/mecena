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

/** Directions for the page itself: what a designer can act on (colour, light, background, type, mood). */
const DIRECTION =
  /\b(sobri\w*|fanzine|minimal\w*|colou?r(es)?|elegante|limpio|tipografia|blanco y negro|portada|fondo|oscur\w*|negr[oa]s?|blanc[oa]s?|luminos\w*|nocturn\w*|calid[oa]s?|vintage|retro|textura|grano|a sangre|paleta|tonos?|mucha imagen)\b/;
/** How answers to "¿cómo te imaginas tu dossier?" start: with the look itself ("Sobrio, en blanco y negro…"). */
const LOOK_OPENING =
  /^(pues |algo |muy |mas |bastante |un |una |me gustaria |lo quiero |lo prefiero )*(sobri[oa]s?|oscur[oa]s?|minimal\w*|elegante|limpi[oa]|en blanco y negro|blanco y negro|en negro|negr[oa]s?|clar[oa]|luminos[oa]|nocturn[oa]|como un fanzine|tipo fanzine|con mucha imagen|con fondo \w+|fondo \w+)\b/;
/** "me lo imagino…" opening the answer (not "el disco me lo imagino…", which is about the work). */
const IMAGINE_OPENING = /^(pues |yo |lo )*(me lo imagino|me imagino|lo imagino)\b/;
/** Things an artist imagines that are not the dossier. */
const OTHER_OBJECT = /\b(disco|album|ep|gira|concierto|directo|espectaculo|montaje|exposicion|serie|proyecto|obra|cuadro|libro|pelicula|corto|cancion|tema)\b/;
/** Fillers around a short follow-up ("Sí, más oscura, por favor"). */
const FILLER = /\b(si|vale|venga|pues|por favor|porfa|todavia|aun|mejor|eso|algo|un poco|mas|muy|y|pero|que sea|en)\b|[,.;:!¡?¿]/g;
const FOLLOW_UP = /^(sobri[oa]|oscur[oa]|negr[oa]|blanc[oa]|clar[oa]|minimal\w*|elegante|limpi[oa]|calid[oa]|fri[oa]|nocturn[oa])$/;

/** One interview segment that asks for a look of the dossier. */
export function isLookRequest(text: string): boolean {
  const n = fold(text).trim();
  if (/\bno (tengo|hay) (un |ningun )?dossier\b/.test(n)) return false;
  if (/\bdossier\b/.test(n)) return DIRECTION.test(n);
  if (OTHER_OBJECT.test(n)) return false;
  // A lone word ("negro") means nothing on its own: it only counts as a follow-up to a look request.
  const opening = LOOK_OPENING.test(n) && n.split(/\s+/).length >= 2;
  return opening || (IMAGINE_OPENING.test(n) && DIRECTION.test(n));
}

/**
 * What the artist asked for their dossier's look during the interview, oldest first: segments that speak about
 * the dossier with a direction a designer can act on ("que predomine el negro de fondo del dossier"), answers that
 * open with the look itself ("Sobrio, en blanco y negro…"), and a bare follow-up right after one ("Sí, más oscura").
 * Talk about the work ("pinto sobre fondo negro", "el disco me lo imagino oscuro") never counts.
 * The design agent treats these as requests.
 */
export function dossierLookRequests(transcript: readonly Pick<TranscriptSegment, "id" | "text">[]): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  let previousWasLook = false;
  for (const s of transcript) {
    const text = s.text.trim();
    const look = isLookRequest(text);
    const bare = fold(text).replace(FILLER, " ").replace(/\s+/g, " ").trim();
    const followUp = !look && previousWasLook && FOLLOW_UP.test(bare);
    if (look || followUp) out.push({ id: s.id, text });
    previousWasLook = look; // a follow-up never chains another one
  }
  return out;
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
