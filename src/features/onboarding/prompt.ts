/**
 * Real-AI onboarding turn: system prompt, compact user payload and a lean output schema for Claude.
 * The schema avoids defaults/unions/optional fields so structured outputs stay simple (profilePatch uses "not said"
 * sentinels, stripped by cleanProfilePatch); ai.ts maps it onto OnboardingTurnResult.
 * Aligned with fleet/spikes/voice/FINDINGS.md (branch spike/voice-extraction) where it fits the per-turn contract:
 * finals only (interims never sent), corrections win, nothing invented, schema pre-warm (ai.ts).
 * Their words, without their typos: sections and profile texts are lexically corrected (WORDING_RULE) while the
 * transcript keeps exactly what was said.
 * Section updates are patches (mode append | replace), merged server-side into full bodies (ai.ts mergeSectionBody);
 * coalescing is client-side (turnQueue.ts).
 * TODO(WP-01 follow-up): the spike's verbatim per-op source quotes are not ported yet.
 */
import { z } from "zod";
import { BusinessSectionKey, CreatorSectionKey, type OnboardingTurnInput, type ProfileKind, type ProfilePatch } from "@/contracts";
import { WORDING_RULE } from "@/server/ai/wording";
import { FAMILY_INTERVIEW, sectionTitles } from "./copy";
import { onboardingFamily } from "./family";

/** How many previous segments the model sees for context (the new one is sent separately). */
export const CONTEXT_SEGMENTS = 10;

/** "" = not said yet (every profilePatch field is required, see llmTurnSchema). */
const LegalForm = z.enum(["", "autonomo", "sl", "sa", "cooperativa", "asociacion", "otra"]);

/**
 * How a section update applies (ai.ts mergeSectionBody): "append" adds only the new paragraphs to what is there,
 * "replace" rewrites the section. Appends keep the output short, and output tokens drive latency (FINDINGS.md 1.3).
 */
export const SectionMode = z.enum(["append", "replace"]);
export type SectionMode = z.infer<typeof SectionMode>;

/** Fields where 0 is the "not said" sentinel (cleanProfilePatch drops it). */
export const NUMERIC_PATCH_FIELDS = ["birthYear", "employees", "foundedYear", "annualRevenueEur"] as const;

/**
 * Every profilePatch field is REQUIRED, with sentinels for "not said in this fragment": "" for texts, [] for lists,
 * 0 for numbers, "" for legalForm. Optional fields blow up the structured-output grammar (17 optional business fields:
 * 400 "Schema is too complex" / "Grammar compilation timed out", measured 2026-11-14); required ones compile in ~3-6 s.
 * cleanProfilePatch() strips the sentinels before anything reaches the profile.
 */
export function llmTurnSchema(kind: ProfileKind) {
  const key = kind === "creator" ? CreatorSectionKey : BusinessSectionKey;
  const text = (what: string) => z.string().describe(`${what}. "" si este fragmento no lo dice`);
  const list = (what: string) => z.array(z.string()).describe(`${what}. [] si este fragmento no dice nada nuevo`);
  const year = (what: string) => z.number().int().describe(`${what}. 0 si este fragmento no lo dice`);
  const common = {
    displayName: text("Nombre artístico, de la banda o compañía, o comercial, tal como lo dice (solo corrige mayúsculas)"),
    city: text("Municipio donde vive y está empadronada o tiene la sede (lo que miran las bases), no donde nació ni de dónde es: «soy de Venezuela y vivo en Vigo» es Vigo. Si solo dice dónde trabaja, ese"),
    province: text("Provincia de ese municipio"),
    region: text("Comunidad autónoma, p. ej. Galicia"),
    achievements: list("Exposiciones, conciertos, discos, estrenos, festivales, publicaciones, premios, clientes: solo los nuevos"),
    education: list("Bellas Artes, conservatorio, arte dramático, escuela de cine, filología, talleres…"),
    links: list("Webs, redes, correos"),
    fundingNeeds: list("Para qué quiere dinero o tiempo, con sus palabras y sin erratas"),
    projectIdea: text("El proyecto que presentaría (una serie, un disco, una gira, una pieza, una película, un libro…), una frase"),
    languages: list("Idiomas"),
  };
  const profilePatch =
    kind === "creator"
      ? z.object({
          ...common,
          birthYear: year("Año de nacimiento"),
          disciplines: list(
            "En minúscula, cualquier arte: pintura, ilustración, fotografía, escultura; música, composición, jazz, música tradicional; teatro, danza, circo; cine, documental, animación; poesía, narrativa, ensayo; diseño gráfico, moda; cerámica, joyería; comisariado…",
          ),
        })
      : z.object({
          ...common,
          legalForm: LegalForm.describe('Forma jurídica (autónomo/a = autonomo, sociedad limitada = sl…). "" si no la dice: nunca la deduzcas'),
          cnae: text("Código CNAE, solo si lo dice"),
          sector: text("Actividad con sus palabras"),
          employees: year("Plantilla total, contando a quien habla"),
          foundedYear: year("Año de inicio"),
          annualRevenueEur: z.number().describe("Facturación anual en euros. 0 si este fragmento no la dice"),
        });
  return z.object({
    profilePatch,
    sectionUpdates: z.array(
      z.object({
        key,
        mode: SectionMode.describe(
          "append = body trae SOLO los párrafos o viñetas nuevos que este fragmento añade; replace = body trae la sección entera reescrita (solo si hay que cambiar algo ya escrito)",
        ),
        body: z.string().describe("append: solo lo nuevo; replace: la sección completa. En primera persona, sin erratas, párrafos y viñetas '- '"),
        sourceSegmentIds: z.array(z.string()).describe("Ids de los fragmentos de los que sale el texto"),
      }),
    ),
    followUpQuestion: z.string().describe("Una pregunta breve para que siga hablando"),
  });
}
export type LlmTurn = z.infer<ReturnType<typeof llmTurnSchema>>;
export type LlmSectionUpdate = LlmTurn["sectionUpdates"][number];
/** What toTurnResult accepts: a missing mode (hand-written fixtures, older outputs) means "replace". */
export type LlmTurnLike = Omit<LlmTurn, "sectionUpdates"> & { sectionUpdates: (Omit<LlmSectionUpdate, "mode"> & { mode?: SectionMode })[] };

/**
 * Claude's profilePatch → ProfilePatch without the "not said" sentinels: "" (and blank) texts, legalForm "",
 * empty lists (and blank items), 0 in the numeric fields. Idempotent, so it also accepts an already clean patch.
 */
export function cleanProfilePatch(raw: Readonly<Record<string, unknown>>): ProfilePatch {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (v === 0 && (NUMERIC_PATCH_FIELDS as readonly string[]).includes(k)) continue;
    if (Array.isArray(v)) {
      const items = v.filter((x) => !(typeof x === "string" && !x.trim()));
      if (items.length) patch[k] = items;
      continue;
    }
    patch[k] = v;
  }
  return patch as ProfilePatch;
}

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
    const missing =
      "por este orden, lo que decide a qué ayudas puede optar: qué vende o qué servicio da (sector), dónde está (municipio), si es autónomo/a, S.L., cooperativa…, cuántas personas son, desde cuándo existe, qué quiere financiar (invertir en maquinaria o local, digitalizar, contratar, exportar, ahorrar energía, innovar) y, si quiere, la facturación aproximada";
    return [
      ...intro("rellena la ficha de empresa de una pyme o un/a autónomo/a mientras habla, para encontrarle ayudas y subvenciones y preparar sus solicitudes (no le estás haciendo un dossier)", keys),
      `- followUpQuestion: una pregunta breve (máx. 15 palabras) sobre lo que falta para optar a ayudas: ${missing}. No repitas preguntas ya respondidas.`,
      "- Pyme: lo más importante es la ficha (profilePatch). Forma jurídica en legalForm (autónomo/a = autonomo, sociedad limitada = sl…); plantilla total en employees; año de inicio en foundedYear; actividad en sector con sus palabras (\"cerámica artesanal\", \"hostelería\"). CNAE solo si lo dice.",
      "- Las secciones son la descripción de la empresa que irá en las solicitudes: mantenlas breves y solo con lo que dice.",
      ...rules(),
    ].join("\n");
  }
  return [
    ...intro("construye el perfil y el dossier de un/a creador/a de cualquier arte (artes visuales, música, artes escénicas: teatro, danza, circo; audiovisual, literatura, diseño o artesanía) mientras habla", keys),
    "- En el dossier: works = obras concretas (cuadros, canciones o discos, piezas o espectáculos, películas, libros); series = proyectos y series (una serie de obra, un disco o una gira, un montaje, una película o un libro en marcha); cv = exposiciones, conciertos, estrenos, festivales, publicaciones, premios y formación.",
    "- El payload trae `familia` (el arte de la persona, si ya se sabe). Lo que importa en cada arte:",
    familyGuide(),
    "- followUpQuestion: una pregunta breve (máx. 15 palabras) sobre lo que falta para optar a convocatorias. Núcleo común: nombre, ciudad, su arte, qué cuenta su obra con sus palabras, proyectos, trayectoria, qué financiación busca y contacto. Luego, lo propio de su arte (lista de arriba). Pregunta en el lenguaje de su arte: a una música no le preguntes por exposiciones ni por técnica pictórica; a un escritor, por libros y editoriales; a una compañía, por piezas y estrenos. Si aún no sabes su arte, pregúntalo sin dar por hecho que pinta. No repitas preguntas ya respondidas.",
    "- No preguntes tú por el diseño del dossier. Si habla de cómo se imagina su dossier (sobrio, con mucha imagen, como un fanzine, colores…), no lo pongas en profilePatch ni en sectionUpdates: se queda en la transcripción.",
    ...rules(),
  ].join("\n");
}

function intro(goal: string, keys: string): string[] {
  return [
    `Eres Mecena, asistente que ${goal}.`,
    "Recibes el perfil actual, las secciones actuales del dossier, los últimos fragmentos de la transcripción y el NUEVO fragmento.",
    "Devuelve solo lo que el nuevo fragmento aporta:",
    "- profilePatch: rellena solo los campos que el fragmento dice o corrige. Si corrige algo (\"no, quería decir…\"), devuelve el valor corregido. Todos los demás van vacíos: \"\" en los textos (también legalForm), [] en las listas y 0 en los números (0 = no lo ha dicho).",
    "- Si dice lo que busca o necesita (\"busco…\", \"quiero…\", \"necesito…\", \"me gustaría…\": una beca, una residencia, producir, grabar, girar, publicar, estrenar, exponer, digitalizar, contratar…), ponlo en fundingNeeds con sus palabras, aunque también lo uses en projectIdea.",
    "- sectionUpdates: solo las secciones que cambian, en primera persona, con sus palabras pero bien escritas (sin erratas ni fallos del dictado), sin adornos ni adjetivos que no haya dicho. Cada una lleva mode:",
    "  · mode \"append\" (lo normal): body trae SOLO los párrafos o viñetas nuevos que aporta este fragmento. No repitas nada de lo que ya hay en seccionesActuales: se añade al final.",
    "  · mode \"replace\": body trae la sección COMPLETA reescrita. Úsalo solo si hay que cambiar algo ya escrito (una corrección, \"no, quería decir…\", o una errata que cambia el sentido) o si la sección todavía no existe.",
    "  Cada sección lista en sourceSegmentIds los ids de los fragmentos de los que sale lo que escribes (incluye el nuevo si lo usas).",
    `- Claves de sección permitidas: ${keys}.`,
  ];
}

function rules(): string[] {
  return [
    "Reglas: castellano de España (tú, nunca voseo) en la pregunta y en lo que dijo en castellano. NUNCA inventes datos que no haya dicho: ni fechas, ni cifras, ni premios, ni lugares. Mantén su forma de decir las cosas. La persona tiene la última palabra.",
    WORDING_RULE,
    "Si el fragmento no aporta nada (muletillas, ruido), devuelve profilePatch con todos los campos vacíos y sectionUpdates vacío, con una pregunta para seguir.",
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
