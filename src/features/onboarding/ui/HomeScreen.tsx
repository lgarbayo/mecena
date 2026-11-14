/** Opening screen (/): one non-scrolling screen with the three sourced data points, the slogan and the mode-aware CTAs. */
import { HeaderEnd } from "@/components/shell/HeaderEnd";
import { HOME, SLOGAN } from "../copy";
import { HomeActions } from "./HomeActions";
import { Stage, glass as g } from "./Stage";
import s from "./home.module.css";
import { Icon } from "@/components/ui/icons";

export function HomeScreen() {
  return (
    <Stage label="Mecena">
      <div className={s.home}>
        <div className={s.top}>
          <span className={g.brand}>Mecena</span>
          {/* the app header is hidden on this full-screen page: keep the mode switch and "Salir" reachable */}
          <HeaderEnd />
        </div>

        <header className={s.head}>
          <p className={g.kicker}>{HOME.kicker}</p>
          <h1 className={s.title}>
            Las ayudas existen. <em>Enterarse a tiempo y prepararlas</em> es otro trabajo.
          </h1>
        </header>

        <ol className={s.data} data-testid="data-points">
          {HOME.dataPoints.map((d, i) => (
            <li key={d.sourceUrl} className={`${g.glass} ${s.point}`} style={{ animationDelay: `${120 + i * 110}ms` }}>
              <strong className={s.figure}>{d.figure}</strong>
              <p className={s.text}>{d.text}</p>
              <a className={s.source} href={d.sourceUrl} target="_blank" rel="noopener noreferrer">
                {HOME.sourcesLabel}: {d.sourceLabel} <Icon name="external" size={13} />
              </a>
            </li>
          ))}
        </ol>

        <div className={s.bottom}>
          <p className={s.slogan}>
            <span>{HOME.closing} </span>
            {SLOGAN}
          </p>
          <HomeActions />
        </div>
      </div>
    </Stage>
  );
}
