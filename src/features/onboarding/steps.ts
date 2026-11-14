/** Stepped onboarding: one question per screen. `fields` tick the step once the profile has them (same as ONBOARDING.hints). */
import type { ProfileKind } from "@/contracts";
import { ONBOARDING } from "./copy";

export interface Step {
  question: string;
  example: string;
  fields: string[];
  /** Sent as the turn's stepKey (defaults to the first field). */
  key?: string;
}

/** stepKey of the creator's last question: how they imagine their dossier (the free layout starts from it). */
export const DOSSIER_LOOK_STEP = "dossierLook";

const QUESTIONS: Record<ProfileKind, { question: string; example: string; key?: string }[]> = {
  creator: [
    { question: "¿Cómo te llamas y desde dónde creas?", example: "«Soy Antía, ilustradora, y trabajo en A Coruña.»" },
    { question: "¿Qué haces? Tu disciplina y tu técnica.", example: "«Pinto con acuarela y tinta, sobre todo retratos.»" },
    { question: "Háblanos de una serie o un proyecto reciente.", example: "«Estoy con una serie sobre las rederas de Malpica.»" },
    { question: "¿Exposiciones, premios o formación que quieras contar?", example: "«Expuse en el Kiosko Alfonso y estudié Bellas Artes en Vigo.»" },
    { question: "¿Qué buscas ahora?", example: "«Una beca para producir la serie y editar un fanzine.»" },
    { question: "¿Cómo te imaginas tu dossier?", example: "«Sobrio, en blanco y negro, con mucha imagen» o «colorido, como un fanzine».", key: DOSSIER_LOOK_STEP },
  ],
  business: [
    { question: "¿Qué hacéis y desde cuándo?", example: "«Somos un taller de cerámica artesanal desde 2019.»" },
    { question: "¿Dónde estáis y cuántas personas sois?", example: "«Estamos en Lugo y somos una persona.»" },
    { question: "¿Algún proyecto o cliente del que estéis orgullosos?", example: "«Hacemos la vajilla de tres restaurantes de Santiago.»" },
    { question: "¿Facturación aproximada? Solo si queréis.", example: "«Unos 48.000 euros al año.»" },
    { question: "¿Qué necesitáis ahora?", example: "«Una tienda online y contratar a una persona.»" },
  ],
};

export function stepsFor(kind: ProfileKind): Step[] {
  return QUESTIONS[kind].map((q, i) => ({ ...q, fields: ONBOARDING.hints[kind][i]?.fields ?? [] }));
}

export const STEPS_COPY = {
  chooseTitle: "¿Cómo nos lo cuentas?",
  chooseLede: (n: number) => `${n} preguntas. Tu perfil y tu dossier se montan solos.`,
  voice: { label: "Hablando", hint: "Como en tu taller" },
  text: { label: "Escribiendo", hint: "A tu ritmo" },
  kind: { creator: "Creador/a", business: "Pyme o autónomo/a" },
  importLink: "Ya tengo dossier",
  /** Coming back with a profile already filled: answers add to it unless the person asks to start over. */
  resumeNote: "Lo nuevo se suma a tu perfil.",
  restart: "Empezar de cero",
  restartWarning: "Borraremos tu perfil, la conversación y el dossier al responder. Tus obras se quedan.",
  keepProfile: "Mejor no",
  step: (i: number, n: number) => `Paso ${i} de ${n}`,
  next: "Siguiente",
  back: "Atrás",
  skip: "Saltar",
  finishStep: "Terminar",
  tapToTalk: "Toca para hablar",
  tapToPause: "Toca para pausar",
  listening: "Te escucho…",
  mecenaAsks: "Mecena pregunta",
  doneTitle: { creator: "Tu perfil está listo.", business: "El perfil de tu empresa está listo." },
  doneLede: "Esto es lo que hemos anotado. Puedes cambiarlo todo cuando quieras.",
  doneEmpty: "Aún no tenemos casi nada. Vuelve atrás y cuéntanos un poco más.",
  toCalls: "Ver convocatorias para mí",
  /** The first dossier proposals start composing by themselves at the end of the interview. */
  composing: (n: number) => `Con lo que me has contado estoy componiendo ${n} propuestas de dossier, cada una con su dirección de arte. Tardan un par de minutos.`,
  seeDossier: "Ver mi dossier",
  /** Voice step: always-visible way out to typing, and back. */
  preferText: "Escribir",
  preferVoice: "Hablar",
  /** iOS ends every dictation session: the next one needs a tap. */
  tapToResume: "Toca para seguir hablando",
  switching: "Cambiando…",
  switchFailed: "No hemos podido cambiar de perfil. Inténtalo de nuevo.",
  photoWork: "Foto de una obra",
  photoTitle: "Fotografía una obra",
  photoLede: "Haz la foto y di qué es: título, año, técnica y medidas. Aparecerá en tu dossier con su ficha.",
  close: "Cerrar",
  transcriptTitle: "Lo que nos has contado",
  turnStatus: { queued: "En cola", sending: "Anotando…", done: "Anotado", failed: "Sin guardar" },
  liveOpen: "Ver entero",
  livePending: "Pendiente",
  liveEmpty: { creator: "Empieza a hablar y verás crecer aquí tu dossier, sección a sección.", business: "Empieza a hablar y verás crecer aquí la ficha de tu empresa." },
  worksTitle: "Obras fotografiadas",
  /** Leaving while answers are still being saved. */
  saving: "Guardando lo último…",
  leaveFailed: "Lo último que nos contaste no se ha guardado.",
  leaveAnyway: "Salir sin guardarlo",
} as const;
