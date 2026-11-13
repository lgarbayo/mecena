import Link from "next/link";
import { ROUTES } from "@/contracts";
import { TRUST } from "../copy";
import { TrustIcon } from "./icons";
import s from "./onboarding.module.css";

/** Compact trust promise shown on /onboarding before the mic button. */
export function TrustStrip() {
  return (
    <aside className={s.trust} aria-label="Nuestro compromiso" data-testid="trust-strip">
      <p className={s.trustTitle}>
        <TrustIcon name="hand" /> {TRUST.title}
      </p>
      <ul className={s.trustList}>
        {TRUST.strip.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Link href={ROUTES.trust} className={s.trustMore}>
        {TRUST.stripMore} →
      </Link>
    </aside>
  );
}
