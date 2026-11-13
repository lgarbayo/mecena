/**
 * Real-AI onboarding turn: system prompt, compact user payload and a lean output schema for Claude.
 * The schema avoids defaults/unions so structured outputs stay simple; ai.ts maps it onto OnboardingTurnResult.
 * Aligned with fleet/spikes/voice/FINDINGS.md (branch spike/voice-extraction) where it fits the per-turn contract:
 * finals only (interims never sent), corrections win, nothing invented, schema pre-warm (ai.ts).
 * TODO(WP-01 follow-up): the spike's verbatim per-op source quotes and server-side coalescing are not ported yet.
 */
import { z } from "zod";
import { BusinessSectionKey, CreatorSectionKey, type OnboardingTurnInput, type ProfileKind } from "@/contracts";
import { FAMILY_INTERVIEW, sectionTitles } from "./copy";
import { onboardingFamily } from "./family";

/** How many previous segments the model sees for context (the new one is sent separately). */
export const CONTEXT_SEGMENTS = 10;

const LegalForm = z.enum(["autonomo", "sl", "sa", "cooperativa", "asociacion", "otra"]);

export function llmTurnSchema(kind: ProfileKind) {
  const key = kind === "creator" ? CreatorSectionKey : BusinessSectionKey;
  const common = {
    displayName: z.string().optional().describe("Nombre artístico, de la banda o compañía, o comercial, tal como lo dice"),
    city: z.string().optional(),
    province: z.string().optional(),
    region: z.string().optional().describe("Comunidad autónoma, p. ej. Galicia"),
    achievements: z.array(z.string()).optional().describe("Exposiciones, conciertos, discos, estrenos, festivales, publicaciones, premios, clientes: solo los nuevos"),
    education: z.array(z.string()).optional().describe("Bellas Artes, conservatorio, arte dramático, escuela de cine, filología, talleres…"),
    links: z.array(z.string()).optional(),
    fundingNeeds: z.array(z.string()).optional().describe("Para qué quiere dinero o tiempo, con sus palabras"),
    projectIdea: z.string().optional().describe("El proyecto que presentaría (una serie, un disco, una gira, una pieza, una película, un libro…), una frase"),
    languages: z.array(z.string()).optional(),
  };
  const profilePatch =
    kind === "creator"
      ? z.object({ ...common, birthYear: z.number().int().optional(), disciplines: z.array(z.string()).optional().describe(
              "En minúscula, cualquier arte: pintura, ilustración, fotografía, escultura; música, composición, jazz, música tradicional; teatro, danza, circo; cine, documental, animación; poesía, narrativa, ensayo; diseño gráfico, moda; cerámica, joyería; comisariado…",
            ) })
      : z.object({
          ...common,
          legalForm: LegalForm.optional(),
          cnae: z.string().optional(),
          sector: z.string().optional(),
          employees: z.number().int().optional(),
          foundedYear: z.number().int().optional(),
          annualRevenueEur: z.number().optional(),
        });
  return z.object({
    profilePatch,
    sectionUpdates: z.array(
      z.object({
        key,
        body: z.string().describe("Texto completo de la sección tras este fragmento, en primera persona, párrafos y viñetas '- '"),
        sourceSegmentIds: z.array(z.string()).describe("Ids de los fragmentos de los que sale el texto"),
      }),
    ),
    followUpQuestion: z.string().describe("Una pregunta breve para que siga hablando"),
  });
}
export type LlmTurn = z.infer<ReturnType<typeof llmTurnSchema>>;

/** What matters in each art, so questions and sections speak its language (creators only). */
function familyGuide(): string {
  const names: Record<string, string> = {
    "artes-visuales": "Artes visuales",
    musica: "Música",
    "artes-escenicas": "Artes escénicas (teatro, danza, circo)",
    audiovisual: "Audiovisual",
    literatura: "Literatura",
    diseno: "Diseño",
    artesania: "Artesanía",
    "gestion-cultural": "Gestión cultural",
  };
  return Object.entries(FAMILY_INTERVIEW)
    .map(([id, f]) => `  · ${names[id]} (${id}): ${f.focus}.`)
    .join("\n");
}

export function systemPrompt(kind: ProfileKind): string {
  const titles = sectionTitles(kind);
  const keys = Object.entries(titles)
    .map(([k, t]) => `${k} (${t})`)
    .join(", ");
  if (kind === "business") {
    const missing = "nombre del negocio, a qué se dedica y desde cuándo, dónde está, cuántas personas son, facturación aproximada y qué necesita (digitalizar, contratar, exportar)";
    return [...intro("una pyme o un/a autónomo/a", keys), `- followUpQuestion: una pregunta breve (máx. 15 palabras) sobre lo que falta para optar a convocatorias: ${missing}. No repitas preguntas ya respondidas.`, ...rules()].join("\n");
  }
  return [
    ...intro("un/a creador/a de cualquier arte: artes visuales, música, artes escénicas (teatro, danza, circo), audiovisual, literatura, diseño o artesanía", keys),
    "- En el dossier: works = obras concretas (cuadros, canciones o discos, piezas o espectáculos, películas, libros); series = proyectos y series (una serie de obra, un disco o una gira, un montaje, una película o un libro en marcha); cv = exposiciones, conciertos, estrenos, festivales, publicaciones, premios y formación.",
    "- El payload trae `familia` (el arte de la persona, si ya se sabe). Lo que importa en cada arte:",
    familyGuide(),
    "- followUpQuestion: una pregunta breve (máx. 15 palabras) sobre lo que falta para optar a convocatorias. Núcleo común: nombre, ciudad, su arte, qué cuenta su obra con sus palabras, proyectos, trayectoria, qué financiación busca y contacto. Luego, lo propio de su arte (lista de arriba). Pregunta en el lenguaje de su arte: a una música no le preguntes por exposiciones ni por técnica pictórica; a un escritor, por libros y editoriales; a una compañía, por piezas y estrenos. Si aún no sabes su arte, pregúntalo sin dar por hecho que pinta. No repitas preguntas ya respondidas.",
    "- No preguntes tú por el diseño del dossier. Si habla de cómo se imagina su dossier (sobrio, con mucha imagen, como un fanzine, colores…), no lo pongas en profilePatch ni en sectionUpdates: se queda en la transcripción.",
    ...rules(),
  ].join("\n");
}

function intro(who: string, keys: string): string[] {
  return [
    `Eres Mecena, asistente que construye el perfil y el dossier de ${who} mientras habla.`,
    "Recibes el perfil actual, las secciones actuales del dossier, los últimos fragmentos de la transcripción y el NUEVO fragmento.",
    "Devuelve solo lo que el nuevo fragmento aporta:",
    "- profilePatch: solo los campos que el fragmento dice o corrige. Si corrige algo (\"no, quería decir…\"), devuelve el valor corregido. Omite el resto.",
    "- Si dice lo que busca o necesita (\"busco…\", \"quiero…\", \"necesito…\", \"me gustaría…\": una beca, una residencia, producir, grabar, girar, publicar, estrenar, exponer, digitalizar, contratar…), ponlo en fundingNeeds con sus palabras, aunque también lo uses en projectIdea.",
    "- sectionUpdates: solo las secciones que cambian, con el texto COMPLETO de la sección (lo que ya había más lo nuevo), reescrito en primera persona, con sus palabras, sin adornos ni adjetivos que no haya dicho. Cada sección lista en sourceSegmentIds los ids de los fragmentos de los que sale (incluye el nuevo si lo usas).",
    `- Claves de sección permitidas: ${keys}.`,
  ];
}

function rules(): string[] {
  return [
    "Reglas: castellano de España (tú, nunca voseo). NUNCA inventes datos que no haya dicho: ni fechas, ni cifras, ni premios, ni lugares. Mantén su forma de decir las cosas. La persona tiene la última palabra.",
    "Si el fragmento no aporta nada (muletillas, ruido), devuelve profilePatch vacío y sectionUpdates vacío, con una pregunta para seguir.",
  ];
}

/** Compact JSON payload: profile + current sections + last ~10 segments + the new segment. */
export function userPayload(input: OnboardingTurnInput): string {
  const { id: _id, kind: _kind, updatedAt: _u, ...profile } = input.profile;
  const previous = input.transcript.filter((s) => s.id !== input.newSegment.id).slice(-CONTEXT_SEGMENTS);
  return JSON.stringify({
    tipo: input.kind,
    // TODO(contracts): use `artFamily` from @/contracts once src/contracts/arts.ts lands.
    familia: input.kind === "creator" ? onboardingFamily(input.profile.disciplines) : undefined,
    perfilActual: profile,
    seccionesActuales: input.sections.map((s) => ({ key: s.key, body: s.body, sourceSegmentIds: s.sourceSegmentIds })),
    fragmentosAnteriores: previous.map((s) => ({ id: s.id, texto: s.text })),
    nuevoFragmento: { id: input.newSegment.id, texto: input.newSegment.text },
  });
}
