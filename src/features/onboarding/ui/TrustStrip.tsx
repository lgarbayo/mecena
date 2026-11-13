import Link from "next/link";
import { ROUTES, type ProfileKind } from "@/contracts";
import { TRUST, TRUST_BUSINESS } from "../copy";
import { TrustIcon } from "./icons";
import s from "./onboarding.module.css";

/** Compact trust promise shown on /onboarding before the mic button. */
export function TrustStrip({ kind = "creator" }: { kind?: ProfileKind }) {
  const t = kind === "business" ? TRUST_BUSINESS : TRUST;
  return (
    <aside className={s.trust} aria-label="Nuestro compromiso" data-testid="trust-strip">
      <p className={s.trustTitle}>
        <TrustIcon name={kind === "business" ? "lock" : "hand"} /> {t.title}
      </p>
      <ul className={s.trustList}>
        {t.strip.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Link href={ROUTES.trust} className={s.trustMore}>
        {t.stripMore} →
      </Link>
    </aside>
  );
}
