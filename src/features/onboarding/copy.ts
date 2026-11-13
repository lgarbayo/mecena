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
  importCta: "Ya tengo dossier: subirlo",
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
  title: { creator: "Cuéntanos qué haces.", business: "Cuéntanos qué hace tu empresa." },
  subtitle: {
    creator: "Habla como si se lo contaras a alguien en tu taller. Mientras hablas, montamos tu perfil y tu dossier.",
    business: "Habla con naturalidad. Mientras hablas, rellenamos la ficha de tu empresa y te enseñamos las ayudas que ya puedes pedir.",
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
      { label: "Qué vendéis o qué servicio dais", fields: ["sector", "cnae"] },
      { label: "Dónde estáis", fields: ["city", "region"] },
      { label: "Autónomo/a, S.L., cooperativa…", fields: ["legalForm"] },
      { label: "Cuántas personas sois y desde cuándo", fields: ["employees", "foundedYear"] },
      { label: "Qué queréis financiar: digitalizar, contratar, invertir, exportar…", fields: ["fundingNeeds", "projectIdea"] },
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
  profilePanel: { creator: "Tu perfil", business: "Ficha de tu empresa" },
  dossierPanel: { creator: "Tu dossier, en construcción", business: "Memoria de tu empresa, en construcción" },
  transcriptPanel: "Lo que nos has contado",
  transcriptEmpty: "Aquí aparecerá lo que digas, palabra por palabra.",
  dossierEmpty: {
    creator: "Tu dossier aparecerá aquí mientras hablas y fotografías tu obra.",
    business: "La memoria de tu empresa aparecerá aquí mientras nos cuentas a qué os dedicáis.",
  },
  sectionPending: "Pendiente",
  noted: (field: string) => `Anotado: ${field}`,
  finishBusinessCount: (n: number) => (n === 1 ? "Ver la ayuda que encaja" : `Ver las ${n} ayudas que encajan`),
  followUpKicker: "Para seguir",
  sending: "Anotando…",
  failed: "Algo ha fallado por nuestra parte. Vuelve a intentarlo; no has perdido nada.",
  retry: "Reintentar",
  fromYourWords: "Con tus palabras",
  finish: {
    creator: { title: "Ahora, tu obra.", body: "Haz una foto de 2 o 3 piezas y cuéntanos qué son. Rellenamos la ficha técnica.", cta: "Fotografiar mi obra" },
    business: { title: "Ya podemos buscarte ayudas.", body: "Con esta ficha comprobamos en qué ayudas encajas y qué te falta para pedirlas. Cuanto más nos cuentes, mejor afinamos.", cta: "Ver ayudas para mi empresa" },
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
  business: ["displayName", "sector", "city", "legalForm", "employees", "foundedYear", "annualRevenueEur", "fundingNeeds", "projectIdea", "achievements", "links"],
};

export const LEGAL_FORM_LABELS: Record<string, string> = {
  autonomo: "Autónomo/a",
  sl: "S.L.",
  sa: "S.A.",
  cooperativa: "Cooperativa",
  asociacion: "Asociación",
  otra: "Otra",
};

/** Business-only labels where the shared FIELD_LABELS read as an artist's profile. */
export const BUSINESS_FIELD_LABELS: Record<string, string> = {
  displayName: "Empresa",
  sector: "Actividad",
  fundingNeeds: "Qué queréis financiar",
  projectIdea: "Proyecto",
  achievements: "Clientes y logros",
};
export function fieldLabel(kind: ProfileKind, field: string): string {
  return (kind === "business" && BUSINESS_FIELD_LABELS[field]) || FIELD_LABELS[field] || "";
}

/** Live "ayudas que ya encajan" panel shown beside the company card while a pyme talks (instead of a dossier). */
export const MATCHES_PANEL = {
  title: "Ayudas que ya encajan",
  loading: "Buscando ayudas…",
  empty: "Todavía no sabemos lo suficiente. Cuéntanos a qué os dedicáis y dónde estáis, y empezamos a buscar.",
  none: "Por ahora no hay ayudas abiertas que encajen. Cuéntanos qué queréis financiar y seguimos buscando.",
  count: (n: number) => (n === 1 ? "1 ayuda encaja con tu empresa" : `${n} ayudas encajan con tu empresa`),
  more: (n: number) => (n === 1 ? "Ver 1 más" : `Ver ${n} más`),
  seeAll: "Ver todas las ayudas",
  failed: "No hemos podido buscar ayudas ahora. Lo intentamos en el siguiente paso.",
} as const;

/** Home actions for a pyme (the creator ones live in HOME). */
export const HOME_BUSINESS = {
  cta: "Cuéntanos qué hace tu empresa",
  calls: "Ver ayudas para mi empresa",
  secondary: "Cómo cuidamos tus datos",
} as const;

/** Trust strip for a pyme: there is no artwork to protect, but there are company data and a submission to sign. */
export const TRUST_BUSINESS = {
  title: "Tu negocio es tuyo; nosotros hacemos el papeleo.",
  strip: ["No entrenamos con los datos de tu empresa.", "Nosotros preparamos; tú presentas la solicitud.", "Tú tienes la última palabra."],
  stripMore: "Cómo cuidamos tus datos",
} as const;

/** Main navigation per mode: a pyme has no works or dossier to build; it looks for aid and applies. */
export const NAV: Record<ProfileKind, { key: "onboarding" | "works" | "dossier" | "calls" | "pricing"; label: string }[]> = {
  creator: [
    { key: "onboarding", label: "Hablar" },
    { key: "works", label: "Obras" },
    { key: "dossier", label: "Dossier" },
    { key: "calls", label: "Convocatorias" },
    { key: "pricing", label: "Pro" },
  ],
  business: [
    { key: "onboarding", label: "Tu empresa" },
    { key: "calls", label: "Ayudas" },
    { key: "pricing", label: "Pro" },
  ],
};
