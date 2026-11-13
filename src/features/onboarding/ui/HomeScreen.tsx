/** Opening data screen (/): three sourced data points, the slogan and the CTA to the voice onboarding. */
import Link from "next/link";
import { ROUTES } from "@/contracts";
import { HOME, SLOGAN } from "../copy";
import s from "./home.module.css";

export function HomeScreen() {
  return (
    <div className={s.home}>
      <header className={s.head}>
        <p className="kicker">{HOME.kicker}</p>
        <h1 className={s.title}>{HOME.title}</h1>
      </header>

      <ol className={s.data} data-testid="data-points">
        {HOME.dataPoints.map((d, i) => (
          <li key={d.sourceUrl} className={s.point} style={{ animationDelay: `${i * 120}ms` }}>
            <strong className={s.figure}>{d.figure}</strong>
            <p className={s.text}>{d.text}</p>
            <a className={s.source} href={d.sourceUrl} target="_blank" rel="noopener noreferrer">
              {HOME.sourcesLabel}: {d.sourceLabel} ↗
            </a>
          </li>
        ))}
      </ol>

      <p className={s.closing}>{HOME.closing}</p>
      <p className={s.slogan}>{SLOGAN}</p>

      <div className={s.actions}>
        <Link className="btn btn-primary" href={ROUTES.onboarding} data-testid="home-cta">
          {HOME.cta}
        </Link>
        <Link className="btn btn-ghost" href={`${ROUTES.onboarding}?subir=1`} data-testid="home-import">
          {HOME.importCta}
        </Link>
        <Link className="btn btn-quiet" href={ROUTES.trust}>
          {HOME.secondary}
        </Link>
      </div>
    </div>
  );
}
