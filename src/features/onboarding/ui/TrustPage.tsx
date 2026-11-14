"use client";
/** /confianza: the expanded trust promise, in the words of the active profile (a pyme has data, not artworks). */
import Link from "next/link";
import { ROUTES } from "@/contracts";
import { useOptionalApp } from "@/components/shell/AppProvider";
import { DeleteAccount } from "@/features/auth/DeleteAccount";
import { TRUST, TRUST_BUSINESS } from "../copy";
import { TrustIcon } from "./icons";
import s from "./trust.module.css";

export function TrustPage() {
  const t = useOptionalApp()?.profile?.kind === "business" ? TRUST_BUSINESS : TRUST;
  return (
    <div className={s.home}>
      <header className={s.head}>
        <p className="kicker">Confianza</p>
        <h1 className={s.title}>{t.title}</h1>
        <p className={s.lede}>{t.intro}</p>
      </header>
      <ul className={s.rules} data-testid="trust-points">
        {t.points.map((p) => (
          <li key={p.title} className={s.rule}>
            <span className={s.ruleIcon}>
              <TrustIcon name={p.icon} />
            </span>
            <div>
              <h2>{p.title}</h2>
              <p>{p.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className={s.actions}>
        <Link className="btn btn-primary" href={ROUTES.onboarding}>
          {t.cta}
        </Link>
      </div>
      <DeleteAccount />
    </div>
  );
}
