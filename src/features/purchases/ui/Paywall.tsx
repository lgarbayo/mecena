"use client";
// STUB (scaffold, working baseline). Owned by WP-07: real RevenueCat paywall with Hormozi offer copy.
// Contract for other WPs: render <Paywall open trigger onClose onPurchased />; onPurchased fires after the
// entitlement is synced server-side, so the caller can simply retry its request.
import { useEffect, useState } from "react";
import type { EntitlementState, PaywallTrigger, Plan, PlanId } from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";
import { Button } from "@/components/ui";
import { getPurchases } from "@/features/purchases/client";

export interface PaywallProps {
  open: boolean;
  trigger: PaywallTrigger;
  onClose(): void;
  onPurchased(entitlement: EntitlementState): void;
}

export function Paywall({ open, onClose, onPurchased }: PaywallProps) {
  const { appUserId } = useApp();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState<PlanId | null>(null);
  useEffect(() => {
    if (!open || !appUserId) return;
    const p = getPurchases();
    p.init(appUserId).then(() => p.getPlans()).then(setPlans);
  }, [open, appUserId]);
  if (!open) return null;
  const buy = async (id: PlanId) => {
    setBusy(id);
    const out = await getPurchases().purchase(id);
    setBusy(null);
    if (out.status === "purchased") onPurchased(out.entitlement);
  };
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Mecena Pro">
      <h2>Mecena Pro</h2>
      {plans.map((p) => (
        <Button key={p.id} disabled={!!busy} onClick={() => buy(p.id)}>
          {p.title} · {p.priceText}
        </Button>
      ))}
      <Button variant="quiet" onClick={onClose}>
        Ahora no
      </Button>
    </div>
  );
}
