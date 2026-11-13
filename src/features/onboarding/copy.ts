/**
 * All user-facing copy for WP-01 (home data screen, trust, voice onboarding) in one swappable module.
 * Source: fleet/pitch/COPY.md (branch docs/pitch), sections 1-3 and 7. Figures come ONLY from fleet/IDEA.md.
 * Spanish from Spain (tú), never voseo.
 */
import type { CreatorSectionKey, BusinessSectionKey, ProfileKind } from "@/contracts";
import type { z } from "zod";

export const SLOGAN = "Tú creas. Mecena se encarga del papeleo.";
export const TRUST_LINE = "El arte es tuyo; nosotros hacemos el papeleo.";

export interface DataPoint {
  figure: string;
  text: string;
  sourceLabel: string;
  sourceUrl: string;
}

export const HOME = {
  kicker: "Mecena",
  title: "Las ayudas existen. Enterarse a tiempo y prepararlas es otro trabajo.",
  closing: "Mecena las encuentra y las prepara contigo.",
  cta: "Empezar hablando",
  secondary: "Cómo cuidamos tu obra",
  sourcesLabel: "Fuente",
  dataPoints: [
    {
      figure: "1 de cada 2",
      text: "artistas en España ingresa menos del salario mínimo.",
      sourceLabel: "Encuesta Nebrija/UGR, 2016-17",
      sourceUrl: "https://masdearte.com/especiales/estudio-sobre-la-situacion-economica-de-los-artistas-en-espana/",
    },
    {
      figure: "34 %",
      text: "de quienes trabajan en cultura son autónomos. En el conjunto de la economía, el 16 %.",
      sourceLabel: "Fundación Cotec, 2025",
      sourceUrl:
        "https://www.bolsamania.com/noticias_amp/economia/economia--el-empleo-en-el-sector-cultural-aumenta-un-17-tras-la-pandemia-frente-al-8-del-conjunto-de-la-economia--19731138.html",
    },
    {
      figure: "+50 %",
      text: "de las pymes no pide ayudas públicas porque no las conoce. Y 1 de cada 4 que empieza una solicitud la abandona por complejidad.",
      sourceLabel: "MuyPymes, oct. 2025",
      sourceUrl: "https://www.muypymes.com/2025/10/02/mitad-pymes-ayudas-publicas-desconocimiento",
    },
  ] satisfies DataPoint[],
} as const;

export interface TrustPoint {
  title: string;
  body: string;
  icon: "hand" | "lock" | "pen" | "stamp";
}

export const TRUST = {
  title: TRUST_LINE,
  intro: "Mecena hace el trabajo de oficina para que tú sigas creando. Estas son nuestras reglas, sin letra pequeña.",
  points: [
    { icon: "hand", title: "No tocamos tu obra.", body: "Nunca generamos ni modificamos obra. Con tus fotos solo recortamos, enderezamos y corregimos el color." },
    { icon: "lock", title: "No entrenamos con tu obra.", body: "Tus imágenes y tus textos son tuyos y solo se usan para preparar tus solicitudes." },
    { icon: "pen", title: "Tú tienes la última palabra.", body: "Cada texto sale de lo que tú cuentas, y puedes cambiarlo todo antes de usarlo." },
    { icon: "stamp", title: "Nosotros preparamos; tú presentas.", body: "La solicitud la envías tú, con tu certificado digital o Cl@ve. Nunca presentamos nada en tu nombre." },
  ] satisfies TrustPoint[],
  /** Compact strip shown on /onboarding before the mic button. */
  strip: ["No generamos ni modificamos obra: solo recortamos, enderezamos y corregimos el color.", "No entrenamos con tu obra.", "Tú tienes la última palabra."],
  stripMore: "Cómo cuidamos tu obra",
  modeQuestion: "¿Qué te trae por aquí?",
  modes: {
    creator: { label: "Soy creador/a", hint: "Artista, ilustrador/a, fotógrafo/a, músico/a…" },
    business: { label: "Tengo una pyme o soy autónomo/a", hint: "Ayudas para tu negocio" },
  },
  cta: "Entendido, empezamos",
  smallPrint: "Puedes cambiar de modo cuando quieras desde la cabecera.",
} as const;

type SectionTitles<K extends string> = Record<K, string>;
export const CREATOR_SECTIONS: SectionTitles<z.infer<typeof CreatorSectionKey>> = {
  statement: "Declaración artística",
  bio: "Biografía",
  series: "Series y proyectos",
  works: "Obras",
  cv: "Trayectoria",
  contact: "Contacto",
};
export const BUSINESS_SECTIONS: SectionTitles<z.infer<typeof BusinessSectionKey>> = {
  activity: "Actividad",
  team: "Equipo",
  projects: "Proyectos",
  figures: "Cifras",
  location: "Datos de la empresa",
  contact: "Contacto",
};
export function sectionTitles(kind: ProfileKind): Record<string, string> {
  return kind === "creator" ? CREATOR_SECTIONS : BUSINESS_SECTIONS;
}

export interface Hint {
  label: string;
  /** Profile fields that, once filled, tick this hint. */
  fields: string[];
}

export const ONBOARDING = {
  kicker: { creator: "Paso 1 · Tu perfil", business: "Paso 1 · Tu empresa" },
  title: { creator: "Cuéntanos qué haces.", business: "Cuéntanos a qué se dedica tu negocio." },
  subtitle: {
    creator: "Habla como si se lo contaras a alguien en tu taller. Mientras hablas, montamos tu perfil y tu dossier.",
    business: "Habla con naturalidad. Mientras hablas, montamos el perfil de tu empresa y su memoria de capacidades.",
  },
  hints: {
    creator: [
      { label: "Quién eres y dónde vives", fields: ["displayName", "city"] },
      { label: "Tu disciplina y tu técnica", fields: ["disciplines"] },
      { label: "Una serie o proyecto reciente", fields: ["projectIdea"] },
      { label: "Exposiciones, premios o formación", fields: ["achievements", "education"] },
      { label: "Qué buscas ahora (beca, residencia, producción…)", fields: ["fundingNeeds"] },
    ],
    business: [
      { label: "Qué hacéis y desde cuándo", fields: ["sector", "foundedYear"] },
      { label: "Dónde estáis y cuántas personas sois", fields: ["city", "employees"] },
      { label: "Proyectos o clientes de los que estés orgulloso/a", fields: ["achievements"] },
      { label: "Facturación aproximada (si quieres)", fields: ["annualRevenueEur"] },
      { label: "Qué necesitas: digitalizar, contratar, exportar…", fields: ["fundingNeeds", "projectIdea"] },
    ],
  } satisfies Record<ProfileKind, Hint[]>,
  record: "Empezar a hablar",
  listening: "Te escuchamos…",
  pause: "Pausar",
  resume: "Seguir hablando",
  done: "Ya está",
  writeToggle: "Prefiero escribir",
  textPlaceholder: "Escribe aquí lo que nos contarías en voz alta…",
  send: "Añadir",
  micNote: "Para escucharte necesitamos el micrófono. Solo lo usamos mientras pulses «Empezar a hablar». La voz la transcribe tu navegador (en Chrome, con servicios de Google); si lo prefieres, escríbelo.",
  micDenied: "No tenemos acceso al micrófono. Actívalo en los ajustes del navegador o escribe tu historia.",
  noSpeech: "No te hemos oído bien. Acércate un poco o prueba a escribir.",
  unsupported: "Este navegador no reconoce la voz. Escríbelo y hacemos lo mismo.",
  profilePanel: { creator: "Tu perfil", business: "Perfil de tu empresa" },
  dossierPanel: { creator: "Tu dossier, en construcción", business: "Memoria de tu empresa, en construcción" },
  transcriptPanel: "Lo que nos has contado",
  transcriptEmpty: "Aquí aparecerá lo que digas, palabra por palabra.",
  dossierEmpty: {
    creator: "Tu dossier aparecerá aquí mientras hablas y fotografías tu obra.",
    business: "La memoria de tu empresa aparecerá aquí mientras nos cuentas a qué os dedicáis.",
  },
  sectionPending: "Pendiente",
  noted: (field: string) => `Anotado: ${field}`,
  followUpKicker: "Para seguir",
  sending: "Anotando…",
  failed: "Algo ha fallado por nuestra parte. Vuelve a intentarlo; no has perdido nada.",
  retry: "Reintentar",
  fromYourWords: "Con tus palabras",
  finish: {
    creator: { title: "Ahora, tu obra.", body: "Haz una foto de 2 o 3 piezas y cuéntanos qué son. Rellenamos la ficha técnica.", cta: "Fotografiar mi obra" },
    business: { title: "Tu memoria ya tiene forma.", body: "Revísala y descárgala en PDF cuando quieras.", cta: "Ver la memoria" },
  },
} as const;

/** Spanish labels for profile fields (rows, chips and "Anotado: …" toasts). */
export const FIELD_LABELS: Record<string, string> = {
  displayName: "Nombre",
  city: "Ciudad",
  province: "Provincia",
  region: "Comunidad",
  birthYear: "Año de nacimiento",
  disciplines: "Disciplinas",
  legalForm: "Forma jurídica",
  cnae: "CNAE",
  sector: "Sector",
  employees: "Personas en el equipo",
  foundedYear: "Desde",
  annualRevenueEur: "Facturación anual",
  bio: "Biografía",
  statement: "Declaración",
  achievements: "Logros",
  education: "Formación",
  links: "Enlaces",
  fundingNeeds: "Qué buscas",
  projectIdea: "Proyecto",
  languages: "Idiomas",
};

/** Profile rows shown in the live panel, in order. */
export const PROFILE_ROWS: Record<ProfileKind, string[]> = {
  creator: ["displayName", "city", "disciplines", "projectIdea", "fundingNeeds", "achievements", "education", "languages", "links"],
  business: ["displayName", "sector", "city", "legalForm", "employees", "foundedYear", "annualRevenueEur", "projectIdea", "fundingNeeds", "achievements", "links"],
};

export const LEGAL_FORM_LABELS: Record<string, string> = {
  autonomo: "Autónomo/a",
  sl: "S.L.",
  sa: "S.A.",
  cooperativa: "Cooperativa",
  asociacion: "Asociación",
  otra: "Otra",
};
