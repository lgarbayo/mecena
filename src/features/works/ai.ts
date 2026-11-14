/**
 * Describe work (WP-02): photo + the artist's voice note -> technical sheet + light crop suggestion.
 * Trust rules: we never generate or alter the artwork (the crop is applied visually, with CSS, on the
 * untouched original) and nothing here trains on user works. Facts come from the artist's words;
 * the image may only add technique/support when evident. Measures are never inferred from pixels.
 */
import { z } from "zod";
import { artFamily, CropSuggestion, DescribeWorkResult, foldText, TechnicalSheet, type AiSlice, type DescribeWorkInput } from "@/contracts";
import { imageBlock, structured } from "@/server/ai/llm";
import { WORDING_RULE } from "@/server/ai/wording";
import { IDENTITY_CROP } from "./crop";
import { FAMILY_PROMPT } from "./arts";
import { mentionsDimensions, mentionsDuration, parseVoiceSheet, sheetFromVoice, UNTITLED } from "./parse";

export { IDENTITY_CROP };

export const DESCRIBE_WORK_SYSTEM = [
  "Ficha técnica de una obra de cualquier arte: artes visuales, música, artes escénicas (teatro, danza, circo), audiovisual, literatura, diseño o artesanía. Toma título/serie/concepto/duración/créditos/lugar de lo que dice el autor; deduce técnica y soporte de la imagen solo si es evidente; medidas solo si las dice. La foto puede ser la obra, la portada, el cartel, un fotograma o una foto de la función: no la confundas con la obra. Sugiere recorte del marco de la obra dentro de la foto (0..1) y rotación; si dudas, recorte identidad. Nunca describas cambios a la obra.",
  "",
  "Reglas:",
  "- Escribe en español de España. El concepto, en primera persona y con las palabras del autor (1-3 frases); si no dice nada sobre el sentido de la pieza, deja concept vacío.",
  "- Campo que el autor no dice y la imagen no muestra con claridad: déjalo vacío (cadena vacía o ausente). Nunca inventes año, medidas, serie ni título.",
  '- Si no hay título, usa "Sin título".',
  "- dimensions con formato \"50 x 70 cm\" (alto x ancho, unidad incluida); solo artes visuales, diseño y artesanía. En literatura, las páginas (\"240 páginas\").",
  "- technique es la técnica, el medio o el formato: \"óleo sobre lino\", \"cuarteto de cuerda\", \"danza contemporánea\", \"cortometraje documental\", \"novela\".",
  "- duration (\"6 min\", \"3:45\", \"90 min\"), credits (formación, intérpretes, compañía, editorial o equipo, texto libre) y venue (dónde se estrenó, publicó o proyectó): solo si el autor lo dice. Nunca los deduzcas de la imagen, ni siquiera de un cartel.",
  "- crop: rectángulo normalizado (x, y, width, height en 0..1 respecto a la foto original) que encuadra solo la obra, quitando fondo, pared o mesa. rotationDeg entre -10 y 10 para enderezar. Si la obra ya ocupa la foto o dudas, devuelve {x:0,y:0,width:1,height:1,rotationDeg:0}.",
  "- Solo recortamos y enderezamos la foto: nunca propongas retocar, repintar, limpiar ni completar la obra.",
  "- confidence: 0..1, tu seguridad global en la ficha.",
  "- Si es una pyme (producto, taller, local), title es el nombre del producto o espacio y technique el material o proceso.",
  "- El título y la serie son nombres propios: respeta su grafía (como mucho corrige mayúsculas).",
  WORDING_RULE,
].join("\n");

// Model-facing schema: plain numbers (the contract's .default() and bounds are re-applied by normalise()).
const ModelSheet = z.object({
  title: z.string(),
  year: z.number().int().optional(),
  technique: z.string().optional(),
  dimensions: z.string().optional(),
  series: z.string().optional(),
  concept: z.string().optional(),
  duration: z.string().optional(),
  credits: z.string().optional(),
  venue: z.string().optional(),
});
const ModelResult = z.object({
  sheet: ModelSheet,
  crop: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number(), rotationDeg: z.number() }),
  confidence: z.number(),
});

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

/** Keep crops sane: inside the photo, not tiny, small rotation. Anything odd -> identity (trust first). */
export function sanitizeCrop(c: Partial<CropSuggestion> | undefined): CropSuggestion {
  if (!c) return { ...IDENTITY_CROP };
  const x = clamp(c.x ?? 0, 0, 1);
  const y = clamp(c.y ?? 0, 0, 1);
  const width = clamp(c.width ?? 1, 0, 1 - x);
  const height = clamp(c.height ?? 1, 0, 1 - y);
  const rotationDeg = Math.round(clamp(c.rotationDeg ?? 0, -10, 10) * 10) / 10;
  if (width * height < 0.25 || width < 0.4 || height < 0.4) return { ...IDENTITY_CROP };
  return CropSuggestion.parse({ x: round3(x), y: round3(y), width: round3(width), height: round3(height), rotationDeg });
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;

const blank = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);

/** "óleo" (said) + "óleo sobre lienzo" (seen) -> the more specific one; a different technique -> the artist's. */
function mergeTechnique(said: string | undefined, seen: string | undefined): string | undefined {
  if (!said) return seen;
  if (seen && seen.toLocaleLowerCase("es-ES").startsWith(said.toLocaleLowerCase("es-ES"))) return seen;
  return said;
}

/** Keep a model value only when the artist actually said it (accent- and case-insensitive). */
function saidIt(value: string | undefined, voice: string | undefined): string | undefined {
  const v = blank(value);
  return v && voice && foldText(voice).includes(foldText(v)) ? v : undefined;
}

/**
 * Merge the model's sheet with what the artist explicitly said. The artist's words win for every
 * factual field; measures are dropped unless the note mentions them (no hallucinated sizes).
 */
export function guardSheet(model: Partial<TechnicalSheet>, voice: string | undefined, now = new Date()): TechnicalSheet {
  const said = parseVoiceSheet(voice);
  const year = said.year ?? model.year;
  const spoke = !!voice?.trim();
  const sheet: TechnicalSheet = {
    // Title and concept are the artist's: with no note there is nothing to take them from, and with one
    // the model may only keep a title the artist actually said.
    title: said.title ?? (spoke ? saidIt(model.title === UNTITLED ? undefined : model.title, voice) : undefined) ?? UNTITLED,
    year: year && year >= 1900 && year <= now.getFullYear() + 1 && (said.year || voice?.includes(String(year))) ? year : undefined,
    technique: mergeTechnique(said.technique, blank(model.technique)),
    dimensions: said.dimensions ?? (mentionsDimensions(voice) ? blank(model.dimensions) : undefined),
    series: said.series ?? (voice && model.series && voice.toLowerCase().includes(model.series.toLowerCase()) ? blank(model.series) : undefined),
    concept: spoke ? (blank(model.concept) ?? said.concept) : undefined,
    duration: said.duration ?? (mentionsDuration(voice) ? blank(model.duration) : undefined),
    credits: said.credits ?? saidIt(model.credits, voice),
    venue: said.venue ?? saidIt(model.venue, voice),
  };
  return TechnicalSheet.parse(Object.fromEntries(Object.entries(sheet).filter(([, v]) => v !== undefined)));
}

function userPrompt(input: DescribeWorkInput): string {
  const who = input.profile
    ? `Autor/a: ${input.profile.displayName || "(sin nombre)"}${input.profile.disciplines?.length ? ` · disciplinas: ${input.profile.disciplines.join(", ")}` : ""}`
    : "";
  const family = artFamily(input.profile?.disciplines);
  return [
    `Tipo de perfil: ${input.kind === "business" ? "pyme / autónomo (producto, taller o local)" : `creador/a (obra artística) · ${FAMILY_PROMPT[family]}`}`,
    who,
    input.voiceDescription?.trim() ? `Lo que dice el autor sobre esta pieza: «${input.voiceDescription.trim()}»` : "El autor no ha dicho nada sobre esta pieza: no inventes título, año, medidas, duración, créditos, lugar, serie ni concepto.",
    "Devuelve la ficha técnica y el recorte sugerido.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Offline stand-in for vision (no API key): a light example crop (~4 % margin) so the crop tools can be
 * shown and tried, never a change to the artwork. It is only used without a key, never as a failure fallback.
 */
export const MOCK_CROP: CropSuggestion = { x: 0.04, y: 0.04, width: 0.92, height: 0.92, rotationDeg: 0 };

function voiceOnly(voiceDescription: string | undefined) {
  const sheet = sheetFromVoice(voiceDescription);
  const filled = Object.keys(parseVoiceSheet(voiceDescription)).length;
  return { sheet, confidence: Math.min(0.9, 0.3 + filled * 0.1) };
}

async function mockDescribe({ voiceDescription, imageBase64 }: DescribeWorkInput): Promise<DescribeWorkResult> {
  // No photo (seeded works): nothing to frame.
  return DescribeWorkResult.parse({ ...voiceOnly(voiceDescription), crop: imageBase64 ? { ...MOCK_CROP } : { ...IDENTITY_CROP } });
}

/** Vision failed: the sheet comes from the artist's words only, the photo stays whole and the UI says so. */
function failedDescribe({ voiceDescription }: DescribeWorkInput): DescribeWorkResult {
  return DescribeWorkResult.parse({ ...voiceOnly(voiceDescription), crop: { ...IDENTITY_CROP }, fallback: true });
}

export const worksAi: AiSlice<"describeWork"> = {
  mock: { describeWork: mockDescribe },
  real: {
    async describeWork(input) {
      try {
        const out = await structured({
          tier: "fast",
          system: DESCRIBE_WORK_SYSTEM,
          user: [imageBlock(input.imageBase64, input.mediaType), { type: "text", text: userPrompt(input) }],
          schema: ModelResult,
          maxTokens: 2000,
        });
        return DescribeWorkResult.parse({
          sheet: guardSheet(out.sheet, input.voiceDescription),
          crop: sanitizeCrop(out.crop),
          confidence: clamp(out.confidence, 0, 1),
        });
      } catch (e) {
        // AiError (refusal / parse / API) or anything unexpected: the demo must keep going on the mock.
        console.warn("[works] describeWork fell back to the voice-only sheet:", e instanceof Error ? e.message : e);
        return failedDescribe(input);
      }
    },
  },
};
