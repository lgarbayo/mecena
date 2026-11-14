import { describe, expect, it } from "vitest";
import { monthlyPrice, OFFER, plansWithPrices } from "@/features/purchases/offer";

const norm = (s: string) => s.replace(/ /g, " ");

describe("plans with live RevenueCat prices", () => {
  it("formats in Spanish and derives the annual note from the real prices (3,99 €/mes · 47,99 €/año)", () => {
    const plans = plansWithPrices({ proMonthly: { amount: 3.99, currency: "EUR" }, proAnnual: { amount: 47.99, currency: "EUR" } });
    expect(plans.map((p) => p.id)).toEqual(["proAnnual", "proMonthly"]); // one-off hidden: no package
    expect(norm(plans[0].priceText)).toBe("47,99 €/año");
    expect(norm(plans[1].priceText)).toBe("3,99 €/mes");
    expect(norm(plans[0].bullets.join(" · "))).toBe("4,00 € al mes"); // 47,99 ≥ 12 × 3,99: no fake saving claim
    expect(plans[0].highlight).toBe(false); // nor a fake "Mejor precio"
    expect(norm(OFFER.anchor(monthlyPrice(plans)))).toContain("Con Mecena, 3,99 € al mes.");
  });

  it("shows the saving only when the annual is really cheaper", () => {
    const plans = plansWithPrices({ proMonthly: { amount: 9, currency: "EUR" }, proAnnual: { amount: 79, currency: "EUR" } });
    expect(norm(plans[0].bullets.join(" · "))).toBe("6,58 € al mes · ahorras un 27 % frente al mensual");
    expect(plans[0].highlight).toBe(true);
  });
});
