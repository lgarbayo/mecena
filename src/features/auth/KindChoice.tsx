/**
 * /empezar: the first screen of the app. Two buttons, creator or pyme, and nothing else. Each one goes to /entrar with
 * that profile (?perfil=creador|pyme): the new account starts in it, a login switches to it, then the opening screen.
 */
import Link from "next/link";
import { startRoute } from "@/contracts";
import { LogoMark } from "@/components/ui/Logo";
import { Stage, glass as g } from "@/features/onboarding/ui/Stage";
import { STEPS_COPY } from "@/features/onboarding/steps";
import s from "./start.module.css";

export function KindChoice() {
  return (
    <Stage label="Mecena">
      <div className={s.start}>
        <span className={`${g.brand} ${s.brand}`}>
          <LogoMark size={44} />
          Mecena
        </span>
        <nav className={s.choices} aria-label="Elige tu perfil">
          <Link href={startRoute("creator")} className={`${g.btn} ${g.btnPrimary} ${s.choice}`} data-testid="start-creator">
            {STEPS_COPY.kind.creator}
          </Link>
          <Link href={startRoute("business")} className={`${g.btn} ${g.btnPrimary} ${s.choice}`} data-testid="start-business">
            {STEPS_COPY.kind.business}
          </Link>
        </nav>
      </div>
    </Stage>
  );
}
