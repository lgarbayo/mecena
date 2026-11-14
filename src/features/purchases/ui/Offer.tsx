"use client";
// WP-07: the offer + purchase flow, shared by the Paywall sheet and /pro.
// RevenueCat: the Web Billing checkout renders inside `checkoutRef`. Mock: a "Modo prueba" confirm step.
// `onPurchased` fires only after the server returned an entitlement that unlocks what the paywall was opened for
// (after a purchase or after "Restaurar compras").
import { useEffect, useRef, useState } from "react";
import type { EntitlementState, PaywallTrigger, Plan, PlanId } from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";
import { Button } from "@/components/ui";
import { getPurchases } from "../client";
import { monthlyPrice, OFFER, PLANS, plansFor, TRIGGER_SUBTITLE, unlocks } from "../offer";
import s from "./paywall.module.css";

export function Offer({ trigger, onPurchased, headingId }: { trigger: PaywallTrigger; onPurchased(e: EntitlementState): void; headingId?: string }) {
  const { appUserId } = useApp();
  const [plans, setPlans] = useState<Plan[]>(PLANS);
  // the adapter is chosen from build-time env, so the mode is known on the first render (no "Modo prueba" flash)
  const mode = getPurchases().mode;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<PlanId | "restore" | null>(null);
  const [pendingMock, setPendingMock] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const checkoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!appUserId) return;
    let live = true;
    const p = getPurchases();
    setReady(false);
    p.init(appUserId)
      .then(async () => {
        if (!live) return;
        setReady(true);
        const loaded = await p.getPlans();
        if (live) setPlans(loaded);
      })
      .catch(() => live && setError(OFFER.loadError));
    return () => {
      live = false;
    };
  }, [appUserId]);

  const buy = async (id: PlanId) => {
    setError(null);
    setInfo(null);
    setBusy(id);
    if (mode === "revenuecat") setTimeout(() => checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 600);
    const out = await getPurchases().purchase(id, { htmlTarget: checkoutRef.current ?? undefined });
    setBusy(null);
    setPendingMock(null);
    if (out.status === "purchased") onPurchased(out.entitlement);
    else if (out.status === "error") setError(out.message || OFFER.error);
  };

  const restore = async () => {
    setError(null);
    setInfo(null);
    setBusy("restore");
    try {
      const e = await getPurchases().restore();
      if (unlocks(trigger, e)) onPurchased(e);
      else setInfo(OFFER.restoreNone);
    } catch (e) {
      setError(e instanceof Error && !e.message.startsWith("sync ") ? e.message : OFFER.restoreError);
    } finally {
      setBusy(null);
    }
  };

  const choose = (id: PlanId) => (mode === "mock" ? setPendingMock(id) : buy(id));
  const shown = plansFor(trigger, plans);
  const chosen = shown.find((p) => p.id === pendingMock);
  const disabled = !ready || !!busy;

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
      <p className={s.anchor}>{OFFER.anchor(monthlyPrice(plans))}</p>

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
        <div className={s.plans} role="list" aria-busy={!ready}>
          {shown.map((p) => (
            <button key={p.id} type="button" role="listitem" className={`${s.plan} ${p.highlight ? s.planBest : ""}`} onClick={() => choose(p.id)} disabled={disabled} data-testid={`plan-${p.id}`}>
              {p.highlight && <span className={s.badge}>{OFFER.bestValue}</span>}
              <span className={s.planTitle}>{p.title}</span>
              <span className={s.planPrice}>{busy === p.id ? "…" : p.priceText}</span>
              <span className={s.planNote}>{p.bullets.join(" · ")}</span>
            </button>
          ))}
        </div>
      )}
      {!ready && !error && <p className={s.note}>{OFFER.loading}</p>}

      {/* RevenueCat Web Billing renders its checkout here (sandbox: card 4242 4242 4242 4242) */}
      <div ref={checkoutRef} className={mode === "revenuecat" && busy && busy !== "restore" ? s.checkout : undefined} />
      {mode === "revenuecat" && busy && busy !== "restore" && <p className={s.note}>{OFFER.sandboxNote}</p>}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className={s.note} role="status">
          {info}
        </p>
      )}
      <p className={s.guarantee}>{OFFER.guarantee}</p>
      <p className={s.free}>{OFFER.free}</p>
      {!chosen && (
        <Button variant="quiet" onClick={restore} disabled={disabled} data-testid="restore-purchases">
          {busy === "restore" ? OFFER.restoring : OFFER.restore}
        </Button>
      )}
    </div>
  );
}
