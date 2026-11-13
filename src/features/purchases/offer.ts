// Owned by WP-07. The offer (Hormozi style): sell the outcome, stack the value, anchor, guarantee. Spanish from Spain.
import type { PaywallTrigger, Plan, PlanId } from "@/contracts";

export const OFFER = {
  kicker: "Mecena Pro",
  headline: "Presenta más solicitudes, mejor preparadas.",
  stack: [
    "Todas las convocatorias que encajan contigo, con avisos antes de que cierren",
    "Solicitudes escritas con tus palabras: memoria, declaración y presupuesto",
    "Tribunal simulado con los criterios oficiales de las bases",
    "Tu dossier adaptado a cada convocatoria",
  ],
  anchor: "Una consultora se lleva un 10-15 % de tu beca. Con Mecena, 9 € al mes.",
  guarantee: "Garantía: si en 90 días no has presentado 3 solicitudes, te devolvemos el dinero.",
  free: "Gratis siempre: tu perfil, tu dossier y 3 convocatorias al mes.",
  later: "Ahora no",
  bestValue: "Mejor precio",
  perMonthAnnual: "6,58 € al mes",
  mockNote: "Modo prueba: no se cobra nada.",
  mockConfirm: "Confirmar compra de prueba",
  checkoutTitle: "Pago seguro",
  sandboxNote: "Entorno de pruebas de RevenueCat: usa la tarjeta 4242 4242 4242 4242.",
  processing: "Activando tu plan…",
  error: "No se pudo completar la compra. Inténtalo de nuevo.",
  isPro: "Eres Pro. Todo desbloqueado.",
  credits: (n: number) => (n === 1 ? "Tienes 1 solicitud premium disponible." : `Tienes ${n} solicitudes premium disponibles.`),
} as const;

/** Trigger-specific subtitle: why the paywall appeared right now. */
export const TRIGGER_SUBTITLE: Record<PaywallTrigger, string> = {
  draft_application: "Tu solicitud está a un paso: Mecena la escribe con lo que ya nos has contado.",
  match_limit: "Hay más convocatorias que encajan contigo. Desbloquéalas todas.",
  jury: "Pasa tu solicitud por el tribunal antes de presentarla.",
  dossier_variant: "Adapta tu dossier a lo que pide cada convocatoria.",
  pricing_page: "Tú creas. Mecena se encarga del papeleo.",
};

/** Plans in display order; prices are replaced by RevenueCat's formatted prices when live. */
export const PLANS: Plan[] = [
  { id: "proAnnual", title: "Pro anual", priceText: "79,00 €/año", kind: "subscription", period: "P1Y", highlight: true, bullets: ["Todo Mecena Pro", "2 meses gratis frente al mensual"] },
  { id: "proMonthly", title: "Pro mensual", priceText: "9,00 €/mes", kind: "subscription", period: "P1M", bullets: ["Todo Mecena Pro", "Cancela cuando quieras"] },
  { id: "solicitudPremium", title: "Solicitud premium", priceText: "15,00 €", kind: "one_off", bullets: ["Una solicitud completa, sin suscripción"] },
];

export const PERIOD_SUFFIX: Partial<Record<PlanId, string>> = { proMonthly: "/mes", proAnnual: "/año" };
