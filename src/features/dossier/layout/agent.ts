/**
 * Layout agent: turns what the artist asks for ("foto grande a toda página y debajo una cita") into a FreeLayout tree.
 * Real: Claude Sonnet 5.5 (or Opus via MECENA_MODEL_LAYOUT) with reasoning on, one retry that tells it what the guard rejected.
 * No mock and no templates: without a key the caller falls back to the template design. Tests inject their own agent.
 * Never writes text of its own: it points at the catalog.
 * Server-only.
 */
import { z } from "zod";
import { AiError, imageBlock, isMockAi, structured, type UserContent } from "@/server/ai/llm";
import { catalogForAgent, type Catalog } from "./catalog";
import type { FreeLayout } from "./schema";
import { MAX_ELEMENTS_PER_PAGE, MAX_PAGES } from "./schema";
import { fromWire, WireLayout } from "./wire";

export interface Direction {
  name: string; // short name of the art direction, chosen by the model
  brief: string; // what it looks like and why it suits this artist's work
}
export interface LayoutAgentInput {
  request: string; // "" = propose from scratch
  current?: FreeLayout; // the layout in force: requests modify it
  catalog: Catalog;
  history: string[];
  direction?: Direction; // art direction of this proposal
  others?: string[]; // names of the other directions of the same batch (be different)
  avoid?: string[]; // directions already shown in earlier batches (do not repeat)
  problem?: string; // what the guard rejected in the previous attempt
  thumbs?: { mediaType: "image/jpeg"; base64: string }[]; // the artist's works, small, so the art direction comes from them
  seed?: string;
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void; // cost measurements
}

/** Layout model: a strong one. Sonnet 5.5 by default; MECENA_MODEL_LAYOUT accepts claude-opus-5-5. Never Haiku for the design. */
export const LAYOUT_MODEL_DEFAULT = "claude-sonnet-5-5";
export const layoutModel = () => process.env.MECENA_MODEL_LAYOUT || LAYOUT_MODEL_DEFAULT;
export const LAYOUT_MAX_TOKENS = 20000; // per layout, reasoning included (cost cap)
export const DIRECTOR_MAX_TOKENS = 6000;

/** Proposals per batch: MECENA_LAYOUT_COUNT, default 3, never more than 4 (cost cap). */
export function layoutCount(): number {
  const n = Number(process.env.MECENA_LAYOUT_COUNT);
  return Number.isFinite(n) && n >= 1 ? Math.min(4, Math.floor(n)) : 3;
}

const RULES = `Cómo funciona:
- Una maquetación es la lista de páginas A4 del dossier. Cada página tiene un fondo (cualquier color, libre por página) y una lista de elementos con posición y tamaño LIBRES en % de la página (x, y, w, h; 0,0 arriba a la izquierda). El orden de la lista es el de pintado .
- Elementos: "text" (un texto, con columnas y giro opcionales), "image" (una obra del artista, con encuadre), "rect" (bloque de color con opacidad, esquinas redondeadas o solo borde; con h≈0.25 es un filete; con opacidad 0.3-0.8 sobre una foto es un velo), "ellipse" (círculo/óvalo, relleno o solo trazo), "line" (línea entre dos puntos con CUALQUIER ángulo, grosor en pt, discontinua opcional).
- Campos: todas las posiciones y tamaños (x,y,w,h,x1,y1,x2,y2) van en % de la página (0-100), NUNCA en puntos; tracking en em (de -0.05 a 0.3, normalmente 0); rotate en grados; todos los colores son #rrggbb. text: x,y,w,h, ref|quote, family, weight, italic, size, lineHeight, align, valign, color, opacity, uppercase, tracking, rotate, columns (las columnas llevan un hueco fijo del 3%). image: x,y,w,h, work, fit, focusX, focusY, frame (none|mat|line), mat, matSize. rect: x,y,w,h, fill, opacity, radius, stroke (el borde mide 1 pt). ellipse: x,y,w,h, opacity, fill y/o stroke. line: x1,y1,x2,y2, width, color, opacity. En text, "ref" y "quote" son obligatorios: pon "" en el que no uses. Lo opcional que no pongas toma un valor por defecto razonable. El orden de la lista es el orden de pintado (primero lo de atrás).
- No hay plantillas ni composiciones prefijadas: decide tú, página a página, dónde va cada cosa, de qué tamaño, con qué proporciones, con qué ritmo entre páginas (portada, páginas de obra a sangre, páginas de solo texto, dobles páginas de aire, rejillas, collage…). Arriesga: una composición sorprendente pero legible vale más que una correcta y aburrida. Cambia de ritmo de una página a otra.
- TEXTOS: nunca escribes texto propio. Un "text" apunta con "ref" a un id del catálogo (nombre, lema, disciplina, ciudad, declaracion, biografia, trayectoria, contacto, obra.N.titulo, obra.N.ficha, obra.N.concepto, t.obra…) o lleva "quote" con una cita LITERAL copiada tal cual de un texto del catálogo (vista previa de frase.N y dicho.N). Si no hay material para algo, no lo inventes. Un mismo texto largo no se repite en dos sitios: si lo quieres en columnas usa "columns" (2-4) en UN solo elemento (o el mismo ref en varias cajas) y el texto fluye de una a otra.
- Texto girado: "rotate" en grados alrededor del centro de la caja (90 o -90 para texto vertical en el margen; caja larga y baja, w grande y h pequeña ANTES de girar). Un texto girado va en una sola columna.
- IMÁGENES: "work" es el número de obra del artista. Solo existen las obras de "obras"; jamás pidas otras. Si no tiene obras (o menos de las que pide), compón con tipografía, color, formas y líneas y dile en "rationale", en una frase, que suba sus fotos en Obra.
- "fit": "cover" llena la caja recortando (con "focusX" y "focusY" (0-1) eliges qué parte queda: el punto focal); "contain" muestra la obra entera. Mira la proporción de cada obra: una apaisada a toda página en vertical se recorta mucho. Una obra puede ser el fondo de una página (imagen a 0,0,100,100) con un velo "rect" de color encima y el texto sobre el velo. Nunca superpongas dos fotos.
- Tipografía: family es cualquiera de las de la lista "tipografias" del catálogo (cada una con sus pesos y si tiene cursiva; si pides otro peso se ajusta al más cercano). Combina con intención: una de titulares y otra de texto, o una sola con contraste de tamaño. size en pt sobre A4 (cuerpo 9-13, titulares 24-90, un nombre puede llegar a 160, hasta 300 en detalles gráficos).
- Color: elige la paleta de cada página (fondo, tinta, acentos) a partir de los "coloresDominantes" de sus obras y de la dirección de arte; no te limites a blanco y negro. El contraste texto/fondo mínimo se garantiza solo.
- Márgenes: los textos quedan dentro del 6% lateral y 5% arriba/abajo (se corrige solo); fotos, rectángulos y líneas pueden llegar al borde.
- Textos largos (declaracion, biografia, trayectoria): cajas amplias. Si no caben se reducen o continúan en otra página; no cuentes con ello para recortar.
- Evita solapar textos entre sí y textos sobre fotos (un título corto sobre una foto es posible; lleva banda automática salvo que pongas un velo).
- Incluye todo el contenido del catálogo que importa (portada con el nombre, declaración, biografía, las obras, trayectoria y contacto) salvo que la petición pida otra cosa. Máximo ${MAX_PAGES} páginas, ${MAX_ELEMENTS_PER_PAGE} elementos por página.
- Si la petición es absurda, imposible o pide algo que no está en el catálogo (otras fotos, datos inventados), haz lo más razonable con lo que hay y explícalo en "rationale".
- name: 2-4 palabras. rationale: 1-3 frases en español de España, tuteando: qué dirección has tomado y por qué encaja con su obra.`;

const SYSTEM = `Eres la maquetadora de Mecena, una diseñadora editorial con criterio propio. Compones el dossier A4 de un artista como un árbol JSON a partir de su obra (las miniaturas que ves), de lo que ha contado y de lo que pide.

${RULES}

- Si hay "direccion", esa es la dirección de arte de ESTA propuesta: llévala hasta el final (retícula, escala, ritmo, tipografía, color). Otras propuestas siguen otras direcciones ("otras"): no te parezcas a ellas ni en la retícula, ni en la escala, ni en las fuentes, ni en los colores.
- Si hay "maquetacionActual", la petición la MODIFICA: cambia solo lo que pide ("más aire", "pon la obra 2 a toda página") y conserva el resto, incluidas todas las demás páginas. Empieza de cero solo si lo pide.
- Si hay "problemaDelIntentoAnterior", corrígelo.`;

const DIRECTOR_SYSTEM = `Eres la directora de arte de Mecena. Un artista va a recibir varias maquetaciones distintas de su dossier. A partir de su obra (las miniaturas), de lo que ha contado y de su disciplina, propones direcciones de arte RADICALMENTE distintas entre sí, pensadas para ESTE artista (no fórmulas): qué paleta, qué tipografía y tono, cómo se trata la fotografía (a sangre, con aire, en rejilla, pequeña), qué ritmo tienen las páginas. Sé concreta y atrevida; cada dirección debe producir un dossier que no se confunda con otro. No repitas las ya mostradas ("yaMostradas"). Devuelves exactamente N direcciones: name (2-4 palabras) y brief (2-3 frases en español de España: cómo es y por qué encaja con su obra y su voz).`;

export const DirectionsSchema = z.object({ directions: z.array(z.object({ name: z.string().min(1).max(60), brief: z.string().min(1).max(600) })).min(1).max(4) });

export function brief(input: LayoutAgentInput) {
  return {
    peticion: input.request,
    peticionesAnteriores: input.history.slice(-4),
    maquetacionActual: input.current ?? null,
    ...(input.direction ? { direccion: input.direction } : {}),
    ...(input.others?.length ? { otras: input.others } : {}),
    catalogo: catalogForAgent(input.catalog),
    ...(input.problem ? { problemaDelIntentoAnterior: input.problem } : {}),
    ...(input.seed ? { semilla: input.seed } : {}),
  };
}

function userContent(input: LayoutAgentInput, payload: unknown): UserContent {
  const blocks: UserContent = [];
  for (const t of input.thumbs ?? []) blocks.push(imageBlock(t.base64, t.mediaType));
  blocks.push({ type: "text", text: JSON.stringify(payload) });
  return blocks;
}

// ---------------------------------------------------------------- entry points

/** The model chooses N art directions from the work and what the artist said (mock: neutral placeholders for tests). */
export async function planDirections(input: LayoutAgentInput & { count: number }): Promise<Direction[]> {
  // No model, no free layout: the caller falls back to the template design (tests inject their own agent).
  if (isMockAi()) throw new AiError("The free layout needs the real model", "api");
  const res = await structured({
    tier: "fast",
    model: layoutModel(),
    effort: "medium",
    thinking: "adaptive",
    onUsage: input.onUsage,
    system: DIRECTOR_SYSTEM,
    schema: DirectionsSchema,
    maxTokens: DIRECTOR_MAX_TOKENS,
    timeoutMs: 60_000,
    maxRetries: 1,
    deadlineMs: 75_000,
    user: userContent(input, { N: input.count, yaMostradas: input.avoid ?? [], catalogo: catalogForAgent(input.catalog), semilla: input.seed }),
  });
  return res.directions.slice(0, input.count);
}

export async function designLayout(input: LayoutAgentInput): Promise<FreeLayout> {
  if (isMockAi()) throw new AiError("The free layout needs the real model", "api");
  const wire = await structured({
    tier: "fast",
    model: layoutModel(),
    effort: "medium",
    thinking: "adaptive",
    onUsage: input.onUsage,
    system: SYSTEM,
    schema: WireLayout,
    maxTokens: LAYOUT_MAX_TOKENS,
    timeoutMs: 170_000,
    maxRetries: 1,
    deadlineMs: 190_000,
    user: userContent(input, brief(input)),
  });
  try {
    return fromWire(wire);
  } catch (e) {
    throw new AiError(`The layout is not valid: ${e instanceof Error ? e.message.slice(0, 200) : e}`, "parse");
  }
}
