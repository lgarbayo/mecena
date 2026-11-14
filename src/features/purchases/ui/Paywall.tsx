"use client";
// Owned by WP-07. Contract for other WPs: render <Paywall open trigger onClose onPurchased />; onPurchased fires after
// the entitlement is synced server-side, so the caller can simply retry its request.
import { useEffect, useId } from "react";
import type { EntitlementState, PaywallTrigger } from "@/contracts";
import { OFFER } from "../offer";
import { Offer } from "./Offer";
import s from "./paywall.module.css";
import { Icon } from "@/components/ui/icons";

export interface PaywallProps {
  open: boolean;
  trigger: PaywallTrigger;
  onClose(): void;
  onPurchased(entitlement: EntitlementState): void;
}

export function Paywall({ open, trigger, onClose, onPurchased }: PaywallProps) {
  const headingId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className={s.backdrop} onClick={onClose} aria-hidden />
      <div className={s.sheet} role="dialog" aria-modal="true" aria-labelledby={headingId} data-testid="paywall">
        <div className={s.grab} aria-hidden />
        <button type="button" className={s.close} onClick={onClose} aria-label={OFFER.later}>
          <Icon name="close" size={18} />
        </button>
        <Offer trigger={trigger} onPurchased={onPurchased} headingId={headingId} />
      </div>
    </>
  );
}
