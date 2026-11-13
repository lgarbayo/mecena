/** Stepped onboarding: one question per screen. `fields` tick the step once the profile has them (same as ONBOARDING.hints). */
import type { ProfileKind } from "@/contracts";
import { ONBOARDING } from "./copy";

export interface Step {
  question: string;
  example: string;
  fields: string[];
}

const QUESTIONS: Record<ProfileKind, { question: string; example: string }[]> = {
  creator: [
    { question: "¿Cómo te llamas y desde dónde creas?", example: "«Soy Antía, ilustradora, y trabajo en A Coruña.»" },
    { question: "¿Qué haces? Tu disciplina y tu técnica.", example: "«Pinto con acuarela y tinta, sobre todo retratos.»" },
    { question: "Háblanos de una serie o un proyecto reciente.", example: "«Estoy con una serie sobre las rederas de Malpica.»" },
    { question: "¿Exposiciones, premios o formación que quieras contar?", example: "«Expuse en el Kiosko Alfonso y estudié Bellas Artes en Vigo.»" },
    { question: "¿Qué buscas ahora?", example: "«Una beca para producir la serie y editar un fanzine.»" },
  ],
  business: [
    { question: "¿Qué hacéis y desde cuándo?", example: "«Somos un taller de cerámica artesanal desde 2019.»" },
    { question: "¿Dónde estáis y cuántas personas sois?", example: "«Estamos en Lugo y somos una persona.»" },
    { question: "¿Algún proyecto o cliente del que estés orgulloso/a?", example: "«Hacemos la vajilla de tres restaurantes de Santiago.»" },
    { question: "¿Facturación aproximada? Solo si quieres.", example: "«Unos 48.000 euros al año.»" },
    { question: "¿Qué necesitas ahora?", example: "«Una tienda online y contratar a una persona.»" },
  ],
};

export function stepsFor(kind: ProfileKind): Step[] {
  return QUESTIONS[kind].map((q, i) => ({ ...q, fields: ONBOARDING.hints[kind][i]?.fields ?? [] }));
}

export const STEPS_COPY = {
  chooseTitle: "¿Cómo prefieres contárnoslo?",
  chooseLede: "Te haremos cinco preguntas. Mientras respondes, montamos tu perfil y tu dossier.",
  voice: { label: "Hablando", hint: "Como si se lo contaras a alguien en tu taller" },
  text: { label: "Escribiendo", hint: "Una pregunta por pantalla, a tu ritmo" },
  kind: { creator: "Soy creador/a", business: "Tengo una pyme o soy autónomo/a" },
  importLink: "Ya tengo dossier: subirlo",
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
} as const;
