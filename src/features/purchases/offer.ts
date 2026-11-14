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
  /** Anchor against a consultancy; uses the live monthly price when RevenueCat returns one. */
  anchor: (monthly = "9 €") => `Una consultora se lleva un 10-15 % de tu beca. Con Mecena, ${monthly} al mes.`,
  guarantee: "Garantía: si en 90 días no has presentado 3 solicitudes, te devolvemos el dinero.",
  free: "Gratis siempre: tu perfil, tu dossier y 3 convocatorias al mes.",
  later: "Ahora no",
  bestValue: "Mejor precio",
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
  { id: "proAnnual", title: "Pro anual", priceText: "79,00 €/año", kind: "subscription", period: "P1Y", highlight: true, bullets: ["6,58 € al mes", "ahorras un 27 % frente al mensual"] },
  { id: "proMonthly", title: "Pro mensual", priceText: "9,00 €/mes", kind: "subscription", period: "P1M", bullets: ["Todo Mecena Pro", "Cancela cuando quieras"] },
  { id: "solicitudPremium", title: "Solicitud premium", priceText: "15,00 €", kind: "one_off", bullets: ["Una solicitud completa, sin suscripción"] },
];

export const PERIOD_SUFFIX: Partial<Record<PlanId, string>> = { proMonthly: "/mes", proAnnual: "/año" };

const eur = (amount: number, currency: string) => new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);

/**
 * Plans with live prices (amounts in the currency's units). The annual note is computed from the real prices:
 * per-month equivalent and the saving against 12 monthly payments, so the copy never contradicts the dashboard.
 */
export function plansWithPrices(prices: Partial<Record<PlanId, { amount: number; currency: string }>>): Plan[] {
  const m = prices.proMonthly;
  const a = prices.proAnnual;
  return PLANS.filter((p) => prices[p.id]).map((p) => {
    const price = prices[p.id]!;
    const plan: Plan = { ...p, priceText: `${eur(price.amount, price.currency)}${PERIOD_SUFFIX[p.id] ?? ""}` };
    if (p.id === "proAnnual") {
      const bullets = [`${eur(price.amount / 12, price.currency)} al mes`];
      const saves = !!m && m.currency === price.currency && m.amount * 12 > price.amount;
      if (saves) bullets.push(`ahorras un ${Math.round((1 - price.amount / (m.amount * 12)) * 100)} % frente al mensual`);
      plan.bullets = bullets;
      plan.highlight = saves; // "Mejor precio" only when it is true

    }
    return plan;
  });
}

/** "3,99 €" out of "3,99 €/mes" (for the anchor). */
export const monthlyPrice = (plans: Plan[]) => plans.find((p) => p.id === "proMonthly")?.priceText.replace(/\/mes$/, "");
