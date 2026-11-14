/** Full-screen immersive stage (no page scroll) with drifting colour fields; used by home and onboarding. */
import type { ReactNode } from "react";
import s from "./immersive.module.css";

export function Stage({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className={s.stage} aria-label={label} data-stage>
      <div className={s.blobs} aria-hidden>
        <span className={s.blob} />
        <span className={s.blob} />
        <span className={s.blob} />
      </div>
      <div className={s.grain} aria-hidden />
      <div className={s.inner}>{children}</div>
    </div>
  );
}

export { s as glass };
