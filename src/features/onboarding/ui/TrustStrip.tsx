import Link from "next/link";
import type { MouseEvent } from "react";
import { ROUTES, type ProfileKind } from "@/contracts";
import { TRUST, TRUST_BUSINESS } from "../copy";
import { TrustIcon } from "./icons";
import s from "./onboarding.module.css";
import { Icon } from "@/components/ui/icons";

/** Compact trust promise shown on /onboarding before the mic button. */
export function TrustStrip({ kind = "creator", onNavigate }: { kind?: ProfileKind; onNavigate?: (e: MouseEvent) => void }) {
  const t = kind === "business" ? TRUST_BUSINESS : TRUST;
  return (
    <aside className={s.trust} aria-label="Nuestro compromiso" data-testid="trust-strip">
      <p className={s.trustTitle}>
        <TrustIcon name={kind === "business" ? "lock" : "hand"} /> {t.title}
      </p>
      <Link href={ROUTES.trust} className={s.trustMore} onClick={onNavigate}>
        {t.stripMore} <Icon name="arrow-right" size={16} />
      </Link>
    </aside>
  );
}
