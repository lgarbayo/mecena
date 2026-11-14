"use client";
// WP-07 /pro: the same offer as a page, plus the current status (Pro / premium credits).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROUTES, type EntitlementState } from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";
import { Card, LoadingRegion, Skeleton } from "@/components/ui";
import { getPurchases } from "../client";
import { OFFER } from "../offer";
import { Offer } from "./Offer";
import s from "./paywall.module.css";

export function ProPage() {
  const { appUserId } = useApp();
  const [ent, setEnt] = useState<EntitlementState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    if (!appUserId) return;
    const p = getPurchases();
    await p.init(appUserId);
    setEnt(await p.getEntitlement());
  }, [appUserId]);
  useEffect(() => {
    load()
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [load]);

  return (
    <>
      {!loaded && !!appUserId && (
        <LoadingRegion label="Comprobando tu plan…" className={s.statusSkeleton}>
          <Skeleton height={52} radius={12} />
        </LoadingRegion>
      )}
      {ent?.pro && (
        <p className={s.status} data-testid="pro-status">
          {OFFER.isPro}
        </p>
      )}
      {!ent?.pro && !!ent?.premiumCredits && (
        <p className={s.status} data-testid="premium-status">
          {OFFER.credits(ent.premiumCredits)} {OFFER.premiumReady} <Link href={ROUTES.calls}>{OFFER.premiumReadyLink}</Link>
        </p>
      )}
      {!ent?.pro && (
        <Card>
          <Offer trigger="pricing_page" onPurchased={setEnt} />
        </Card>
      )}
    </>
  );
}
