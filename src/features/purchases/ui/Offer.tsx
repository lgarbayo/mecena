"use client";
// WP-07: the offer + purchase flow, shared by the Paywall sheet and /pro.
// RevenueCat: the Web Billing checkout renders inside `checkoutRef`. Mock: a "Modo prueba" confirm step.
// `onPurchased` fires only after the server sync returned the new entitlement.
import { useEffect, useRef, useState } from "react";
import type { EntitlementState, PaywallTrigger, Plan, PlanId } from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";
import { Button } from "@/components/ui";
import { getPurchases } from "../client";
import { OFFER, PLANS, TRIGGER_SUBTITLE } from "../offer";
import s from "./paywall.module.css";

export function Offer({ trigger, onPurchased, headingId }: { trigger: PaywallTrigger; onPurchased(e: EntitlementState): void; headingId?: string }) {
  const { appUserId } = useApp();
  const [plans, setPlans] = useState<Plan[]>(PLANS);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [pendingMock, setPendingMock] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"revenuecat" | "mock">("mock");
  const checkoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!appUserId) return;
    const p = getPurchases();
    setMode(p.mode);
    p.init(appUserId)
      .then(() => p.getPlans())
      .then(setPlans)
      .catch(() => setError("No hemos podido cargar los planes. Revisa la conexión."));
  }, [appUserId]);

  const buy = async (id: PlanId) => {
    setError(null);
    setBusy(id);
    const out = await getPurchases().purchase(id, { htmlTarget: checkoutRef.current ?? undefined });
    setBusy(null);
    setPendingMock(null);
    if (out.status === "purchased") onPurchased(out.entitlement);
    else if (out.status === "error") setError(out.message || OFFER.error);
  };

  const choose = (id: PlanId) => (mode === "mock" ? setPendingMock(id) : buy(id));
  const chosen = plans.find((p) => p.id === pendingMock);

  return (
    <div className={s.offer}>
      <p className={s.kicker}>{OFFER.kicker}</p>
      <h2 className={s.headline} id={headingId}>
        {OFFER.headline}
      </h2>
      <p className={s.sub}>{TRIGGER_SUBTITLE[trigger]}</p>
      <ul className={s.stack}>
        {OFFER.stack.map((v) => (
          <li key={v}>{v}</li>
        ))}
      </ul>
      <p className={s.anchor}>{OFFER.anchor}</p>

      {chosen ? (
        <div className={s.confirm} data-testid="mock-confirm">
          <strong>
            {chosen.title} · {chosen.priceText}
          </strong>
          <p className={s.note}>{OFFER.mockNote}</p>
          <Button onClick={() => buy(chosen.id)} disabled={!!busy}>
            {busy ? OFFER.processing : OFFER.mockConfirm}
          </Button>
          <Button variant="quiet" onClick={() => setPendingMock(null)} disabled={!!busy}>
            Volver
          </Button>
        </div>
      ) : (
        <div className={s.plans} role="list">
          {plans.map((p) => (
            <button key={p.id} type="button" role="listitem" className={`${s.plan} ${p.highlight ? s.planBest : ""}`} onClick={() => choose(p.id)} disabled={!!busy} data-testid={`plan-${p.id}`}>
              {p.highlight && <span className={s.badge}>{OFFER.bestValue}</span>}
              <span className={s.planTitle}>{p.title}</span>
              <span className={s.planPrice}>{busy === p.id ? "…" : p.priceText}</span>
              <span className={s.planNote}>{p.id === "proAnnual" ? `${OFFER.perMonthAnnual} · ${p.bullets[1]}` : p.bullets.join(" · ")}</span>
            </button>
          ))}
        </div>
      )}

      {/* RevenueCat Web Billing renders its checkout here (sandbox: card 4242 4242 4242 4242) */}
      <div ref={checkoutRef} className={mode === "revenuecat" && busy ? s.checkout : undefined} />
      {mode === "revenuecat" && busy && <p className={s.note}>{OFFER.sandboxNote}</p>}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <p className={s.guarantee}>{OFFER.guarantee}</p>
      <p className={s.free}>{OFFER.free}</p>
    </div>
  );
}
