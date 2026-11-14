/** Full-screen stage (no page scroll behind it) on a calm light page; used by home and onboarding. */
import type { ReactNode } from "react";
import s from "./immersive.module.css";

export function Stage({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className={s.stage} aria-label={label} data-stage>
      <div className={s.inner}>{children}</div>
    </div>
  );
}

export { s as glass };
