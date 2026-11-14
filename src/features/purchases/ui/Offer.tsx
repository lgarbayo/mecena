"use client";
// WP-07: the offer + purchase flow, shared by the Paywall sheet and /pro.
// RevenueCat: the Web Billing checkout opens as the SDK's own full-screen sheet above ours (embedded in our scrolling
// sheet it was squeezed to a sliver on phones). Mock: a "Modo prueba" confirm step.
// `onPurchased` fires only after the server returned an entitlement that unlocks what the paywall was opened for
// (after a purchase or after "Restaurar compras").
import { useEffect, useState, type ReactNode } from "react";
import type { EntitlementState, PaywallTrigger, Plan, PlanId } from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";
import { Button, LoadingRegion } from "@/components/ui";
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
  const [initFailed, setInitFailed] = useState(false);
  const [attempt, setAttempt] = useState(0); // bump to retry a failed init

  useEffect(() => {
    if (!appUserId) return;
    let live = true;
    const p = getPurchases();
    setReady(false);
    setInitFailed(false);
    p.init(appUserId)
      .then(async () => {
        if (!live) return;
        setReady(true);
        const loaded = await p.getPlans();
        if (live) setPlans(loaded);
      })
      .catch(() => {
        if (!live) return;
        setInitFailed(true);
        setError(OFFER.loadError);
      });
    return () => {
      live = false;
    };
  }, [appUserId, attempt]);

  const buy = async (id: PlanId) => {
    if (busy) return; // one purchase at a time: a double tap never opens two checkouts
    setError(null);
    setInfo(null);
    setBusy(id);
    const out = await getPurchases().purchase(id);
    setBusy(null);
    setPendingMock(null);
    // the server decides: only an entitlement that unlocks this screen counts as done
    if (out.status === "purchased") {
      if (unlocks(trigger, out.entitlement)) onPurchased(out.entitlement);
      else setError(OFFER.paidNotSynced);
    } else if (out.status === "error") setError(out.message || OFFER.error);
  };

  const restore = async () => {
    if (busy) return;
    setError(null);
    setInfo(null);
    setBusy("restore");
    try {
      const e = await getPurchases().restore();
      if (unlocks(trigger, e)) onPurchased(e);
      else setInfo(e.premiumCredits > 0 ? OFFER.restoreCreditsOnly(e.premiumCredits) : OFFER.restoreNone);
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
        <PlansLoading loading={!ready && !error} label={OFFER.loading}>
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
        </PlansLoading>
      )}

      {mode === "revenuecat" && busy && busy !== "restore" && <p className={s.note}>{OFFER.sandboxNote}</p>}
      {error && (
        <p className={s.error} role="alert">
          {error}{" "}
          {initFailed && (
            <Button variant="quiet" onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}>
              Reintentar
            </Button>
          )}
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
        <Button variant="quiet" onClick={restore} disabled={!!busy} data-testid="restore-purchases">
          {busy === "restore" ? OFFER.restoring : OFFER.restore}
        </Button>
      )}
    </div>
  );
}

/** While the purchases adapter loads, the real plan cards stay in place (disabled, prices dimmed) inside a busy status region. */
function PlansLoading({ loading, label, children }: { loading: boolean; label: string; children: ReactNode }) {
  return loading ? <LoadingRegion label={label}>{children}</LoadingRegion> : <>{children}</>;
}
