/** Opening data screen (/): three sourced data points, the slogan and the CTA to the voice onboarding. */
import { HOME, SLOGAN } from "../copy";
import { HomeActions } from "./HomeActions";
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

      <HomeActions />
    </div>
  );
}
