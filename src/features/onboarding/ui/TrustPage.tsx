/** /confianza: the expanded trust promise. */
import Link from "next/link";
import { ROUTES } from "@/contracts";
import { TRUST } from "../copy";
import { TrustIcon } from "./icons";
import s from "./home.module.css";

export function TrustPage() {
  return (
    <div className={s.home}>
      <header className={s.head}>
        <p className="kicker">Confianza</p>
        <h1 className={s.title}>{TRUST.title}</h1>
        <p className={s.lede}>{TRUST.intro}</p>
      </header>
      <ul className={s.rules} data-testid="trust-points">
        {TRUST.points.map((p) => (
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
          {TRUST.cta}
        </Link>
      </div>
    </div>
  );
}
