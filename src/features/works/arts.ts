/**
 * Per-art copy for /obras (CCR-arts): what to photograph, the labels of the technical sheet and the
 * dictation example change with the profile's family. A painter sees Técnica/Medidas; a musician
 * Formación/Duración; a dancer Disciplina/Duración/Estreno; a writer Género/Editorial/Páginas.
 */
import type { ArtFamily, MediaKind, TechnicalSheet } from "@/contracts";

export type SheetKey = keyof TechnicalSheet;
export type Field = { key: SheetKey; label: string; placeholder: string; wide?: boolean; multiline?: boolean };

export interface ArtCopy {
  /** Singular / plural noun for a work ("obra", "pieza", "obra"…). */
  noun: string;
  nounPlural: string;
  kicker: string;
  title: string;
  intro: string;
  captureLead: string;
  photoTip: string;
  noteLabel: string;
  notePlaceholder: string;
  empty: string;
  linksHint: string;
  fields: Field[];
}

const title = (placeholder = "Sin título"): Field => ({ key: "title", label: "Título", placeholder, wide: true });
const year: Field = { key: "year", label: "Año", placeholder: "2025" };
const concept = (placeholder = "Qué cuenta esta obra, con tus palabras"): Field => ({ key: "concept", label: "Concepto", placeholder, wide: true, multiline: true });

const VISUAL: ArtCopy = {
  noun: "obra",
  nounPlural: "obras",
  kicker: "Tus obras",
  title: "Fotografía tus obras",
  intro: "Una foto con el móvil y una frase por obra. Mecena escribe la ficha técnica; tú la revisas y confirmas.",
  captureLead: "Haz una foto a la obra y dinos una frase sobre ella.",
  photoTip: "Consejo: foto de frente, con luz natural y la obra entera en el encuadre.",
  noteLabel: "Cuéntanos la obra en una frase",
  notePlaceholder: "«Se llama Redeira II, acuarela sobre papel de 2025, 50 por 70, de la serie Redeiras»",
  empty: "Aún no hay obras. Haz la primera foto: con dos o tres basta para empezar.",
  linksHint: "¿Está en tu web o en una exposición en línea? Añade el enlace.",
  fields: [
    title("Redeira II"),
    year,
    { key: "dimensions", label: "Medidas", placeholder: "50 x 70 cm" },
    { key: "technique", label: "Técnica", placeholder: "acuarela sobre papel", wide: true },
    { key: "series", label: "Serie", placeholder: "Redeiras", wide: true },
    concept(),
  ],
};

export const ART_COPY: Record<ArtFamily, ArtCopy> = {
  "artes-visuales": VISUAL,
  musica: {
    noun: "obra",
    nounPlural: "obras",
    kicker: "Tu música",
    title: "Tus temas y obras",
    intro: "Una foto y una frase por obra: un tema, un disco, una pieza o un concierto. Mecena escribe la ficha; tú la revisas y confirmas.",
    captureLead: "Haz una foto del concierto, la portada o el cartel, y dinos una frase sobre la obra.",
    photoTip: "Consejo: la portada del disco, el cartel o una foto del directo. Luego añade el enlace para que se pueda escuchar.",
    noteLabel: "Cuéntanos la obra en una frase",
    notePlaceholder: "«Nana para Lúa, 2024, cuarteto de cuerda, 6 minutos, estrenada en el Auditorio de Galicia»",
    empty: "Aún no hay obras. Empieza por la portada o el cartel de tu último trabajo.",
    linksHint: "Añade dónde se puede escuchar: Bandcamp, SoundCloud, Spotify o YouTube.",
    fields: [
      title("Nana para Lúa"),
      year,
      { key: "duration", label: "Duración", placeholder: "6 min" },
      { key: "technique", label: "Formación", placeholder: "cuarteto de cuerda", wide: true },
      { key: "credits", label: "Intérpretes", placeholder: "Quién toca o canta", wide: true },
      { key: "venue", label: "Estreno o sello", placeholder: "Auditorio de Galicia", wide: true },
      { key: "series", label: "Disco o ciclo", placeholder: "Opcional", wide: true },
      concept("Qué cuenta esta música, con tus palabras"),
    ],
  },
  "artes-escenicas": {
    noun: "pieza",
    nounPlural: "piezas",
    kicker: "Tus piezas",
    title: "Tus espectáculos",
    intro: "Una foto de la función y una frase por pieza. Mecena escribe la ficha artística; tú la revisas y confirmas.",
    captureLead: "Haz o elige una foto de la función, del ensayo o el cartel, y dinos una frase sobre la pieza.",
    photoTip: "Consejo: una foto de escena con buena luz dice más que el cartel. Si hay vídeo, añade el enlace.",
    noteLabel: "Cuéntanos la pieza en una frase",
    notePlaceholder: "«Raíz, danza contemporánea, 45 minutos, estrenada en el Teatro Rosalía de Castro con la compañía Nordés»",
    empty: "Aún no hay piezas. Empieza por tu último estreno.",
    linksHint: "Añade el vídeo de la pieza o el teaser (YouTube o Vimeo).",
    fields: [
      title("Raíz"),
      year,
      { key: "duration", label: "Duración", placeholder: "45 min" },
      { key: "technique", label: "Disciplina", placeholder: "danza contemporánea", wide: true },
      { key: "venue", label: "Estreno", placeholder: "Teatro Rosalía de Castro", wide: true },
      { key: "credits", label: "Compañía y elenco", placeholder: "Quién la hace", wide: true },
      concept("De qué trata la pieza, con tus palabras"),
    ],
  },
  audiovisual: {
    noun: "obra",
    nounPlural: "obras",
    kicker: "Tus obras",
    title: "Tus películas y vídeos",
    intro: "Un fotograma o el cartel y una frase por obra. Mecena escribe la ficha; tú la revisas y confirmas.",
    captureLead: "Haz una foto de un fotograma o el cartel, y dinos una frase sobre la obra.",
    photoTip: "Consejo: elige un fotograma que represente la obra. Después añade el enlace para verla.",
    noteLabel: "Cuéntanos la obra en una frase",
    notePlaceholder: "«Se llama Faro, cortometraje documental de 2021, 12 minutos, proyectado en el Festival de Cans»",
    empty: "Aún no hay obras. Empieza por tu último corto o pieza.",
    linksHint: "Añade el enlace a la obra o al tráiler (Vimeo, YouTube…).",
    fields: [
      title("Faro"),
      year,
      { key: "duration", label: "Duración", placeholder: "12 min" },
      { key: "technique", label: "Formato", placeholder: "cortometraje documental", wide: true },
      { key: "credits", label: "Equipo", placeholder: "Dirección, guion, fotografía…", wide: true },
      { key: "venue", label: "Festivales o estreno", placeholder: "Festival de Cans", wide: true },
      concept("De qué trata, con tus palabras"),
    ],
  },
  literatura: {
    noun: "obra",
    nounPlural: "obras",
    kicker: "Tus libros",
    title: "Tus libros y textos",
    intro: "La cubierta y una frase por obra. Mecena escribe la ficha; tú la revisas y confirmas.",
    captureLead: "Haz una foto de la cubierta o una página, y dinos una frase sobre la obra.",
    photoTip: "Consejo: la cubierta de frente y entera. Si aún no está publicada, una página del manuscrito.",
    noteLabel: "Cuéntanos la obra en una frase",
    notePlaceholder: "«Se titula Mar de fondo, novela, publicada por Editorial Galaxia en 2023, 240 páginas»",
    empty: "Aún no hay obras. Empieza por tu último libro o un manuscrito.",
    linksHint: "Añade la página de la editorial o donde se pueda leer.",
    fields: [
      title("Mar de fondo"),
      year,
      { key: "dimensions", label: "Páginas", placeholder: "240 páginas" },
      { key: "technique", label: "Género", placeholder: "novela, poemario, ensayo…", wide: true },
      { key: "credits", label: "Editorial", placeholder: "Inédito si aún no está publicado", wide: true },
      { key: "series", label: "Colección", placeholder: "Opcional", wide: true },
      concept("De qué trata, con tus palabras"),
    ],
  },
  diseno: {
    ...VISUAL,
    noun: "proyecto",
    nounPlural: "proyectos",
    kicker: "Tus proyectos",
    title: "Fotografía tus proyectos",
    intro: "Una foto y una frase por proyecto. Mecena escribe la ficha; tú la revisas y confirmas.",
    captureLead: "Haz una foto del proyecto (pieza, prototipo, cartel o pantalla) y dinos una frase sobre él.",
    noteLabel: "Cuéntanos el proyecto en una frase",
    notePlaceholder: "«Se llama Lonxa, identidad visual de 2024 para la cofradía de Malpica»",
    empty: "Aún no hay proyectos. Empieza por el que más te representa.",
    linksHint: "Añade el enlace al proyecto (Behance, tu web…).",
    fields: [
      title("Lonxa"),
      year,
      { key: "dimensions", label: "Medidas", placeholder: "Opcional" },
      { key: "technique", label: "Tipo y material", placeholder: "identidad visual, mobiliario…", wide: true },
      { key: "credits", label: "Cliente o equipo", placeholder: "Opcional", wide: true },
      concept("Qué problema resuelve, con tus palabras"),
    ],
  },
  artesania: {
    ...VISUAL,
    noun: "pieza",
    nounPlural: "piezas",
    kicker: "Tus piezas",
    title: "Fotografía tus piezas",
    intro: "Una foto y una frase por pieza. Mecena escribe la ficha; tú la revisas y confirmas.",
    captureLead: "Haz una foto a la pieza y dinos una frase sobre ella.",
    photoTip: "Consejo: fondo liso, luz natural y la pieza entera en el encuadre.",
    noteLabel: "Cuéntanos la pieza en una frase",
    notePlaceholder: "«Se llama Cunca, cerámica esmaltada de 2025, 12 por 8, de la serie Mar»",
    empty: "Aún no hay piezas. Haz la primera foto: con dos o tres basta para empezar.",
    fields: [
      title("Cunca"),
      year,
      { key: "dimensions", label: "Medidas", placeholder: "12 x 8 cm" },
      { key: "technique", label: "Material y técnica", placeholder: "cerámica esmaltada", wide: true },
      { key: "series", label: "Colección", placeholder: "Opcional", wide: true },
      concept("Qué cuenta esta pieza, con tus palabras"),
    ],
  },
  "gestion-cultural": {
    ...VISUAL,
    noun: "proyecto",
    nounPlural: "proyectos",
    kicker: "Tus proyectos",
    title: "Tus proyectos culturales",
    intro: "Una foto y una frase por proyecto: una exposición, un ciclo, un festival. Mecena escribe la ficha; tú la revisas y confirmas.",
    captureLead: "Haz una foto del proyecto (montaje, público o cartel) y dinos una frase sobre él.",
    photoTip: "Consejo: una foto con público cuenta el impacto mejor que el cartel.",
    noteLabel: "Cuéntanos el proyecto en una frase",
    notePlaceholder: "«Se llama Mar de Libros, ciclo de 2024, presentado en la Biblioteca de Malpica»",
    empty: "Aún no hay proyectos. Empieza por el último que hiciste.",
    linksHint: "Añade la web del proyecto o una nota de prensa.",
    fields: [
      title("Mar de Libros"),
      year,
      { key: "technique", label: "Formato", placeholder: "exposición, ciclo, festival…", wide: true },
      { key: "venue", label: "Lugar", placeholder: "Biblioteca de Malpica", wide: true },
      { key: "credits", label: "Equipo y socios", placeholder: "Opcional", wide: true },
      concept("Qué consiguió, con tus palabras"),
    ],
  },
};

export const BUSINESS_COPY: ArtCopy = {
  noun: "foto",
  nounPlural: "fotos",
  kicker: "Fotos (opcional)",
  title: "Enseña lo que haces",
  intro: "Las fotos son opcionales en una pyme: si quieres, añade productos, tu taller o tu local y aparecerán en tu dossier. Si no, pasa directamente al dossier.",
  captureLead: "Haz una foto de un producto, tu taller o tu local.",
  photoTip: "Consejo: foto de frente, con luz natural.",
  noteLabel: "Cuéntanos qué es",
  notePlaceholder: "«Se llama Taza Mar, cerámica esmaltada, 10 por 8»",
  empty: "Todavía no has añadido fotos. No pasa nada: son opcionales.",
  linksHint: "Añade la página del producto o tu tienda en línea.",
  fields: [
    { key: "title", label: "Nombre", placeholder: "Producto, taller o local", wide: true },
    year,
    { key: "dimensions", label: "Medidas", placeholder: "Opcional" },
    { key: "technique", label: "Material o proceso", placeholder: "cerámica esmaltada", wide: true },
    { key: "series", label: "Línea o colección", placeholder: "Opcional", wide: true },
    { key: "concept", label: "Descripción", placeholder: "Para qué sirve, qué lo hace especial", wide: true, multiline: true },
  ],
};

export function artCopy(family: ArtFamily, business?: boolean): ArtCopy {
  return business ? BUSINESS_COPY : ART_COPY[family];
}

/** One line for the vision prompt so the model knows what the photo probably shows. */
export const FAMILY_PROMPT: Record<ArtFamily, string> = {
  "artes-visuales": "artes visuales: la foto suele ser la propia obra",
  musica: "música: la foto suele ser la portada, el cartel o el directo; technique = formación o estilo",
  "artes-escenicas": "artes escénicas: la foto suele ser de la función o el cartel; technique = disciplina (danza contemporánea, teatro, circo…)",
  audiovisual: "audiovisual: la foto suele ser un fotograma o el cartel; technique = formato (cortometraje, documental, videoclip…)",
  literatura: "literatura: la foto suele ser la cubierta o una página; technique = género; credits = editorial; dimensions = páginas",
  diseno: "diseño: la foto es el proyecto, prototipo o pieza",
  artesania: "artesanía: la foto es la pieza; technique = material y técnica",
  "gestion-cultural": "gestión cultural: la foto es del proyecto, el montaje o el público",
};

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  image: "Imagen",
  video: "Vídeo",
  audio: "Audio",
  text: "Texto",
  performance: "Escena",
  object: "Objeto",
};
