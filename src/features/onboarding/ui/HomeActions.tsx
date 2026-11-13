"use client";
/** Home CTAs per mode: a creator starts talking or uploads a dossier; a pyme describes its company or goes to its aid. */
import Link from "next/link";
import { ROUTES } from "@/contracts";
import { useOptionalApp } from "@/components/shell/AppProvider";
import { HOME, HOME_BUSINESS } from "../copy";
import s from "./home.module.css";

export function HomeActions() {
  const business = useOptionalApp()?.profile?.kind === "business";
  return (
    <div className={s.actions}>
      {business ? (
        <>
          <Link className="btn btn-primary" href={ROUTES.onboarding} data-testid="home-cta">
            {HOME_BUSINESS.cta}
          </Link>
          <Link className="btn btn-ghost" href={ROUTES.calls} data-testid="home-calls">
            {HOME_BUSINESS.calls}
          </Link>
        </>
      ) : (
        <>
          <Link className="btn btn-primary" href={ROUTES.onboarding} data-testid="home-cta">
            {HOME.cta}
          </Link>
          <Link className="btn btn-ghost" href={`${ROUTES.onboarding}?subir=1`} data-testid="home-import">
            {HOME.importCta}
          </Link>
        </>
      )}
      <Link className="btn btn-quiet" href={ROUTES.trust}>
        {business ? HOME_BUSINESS.secondary : HOME.secondary}
      </Link>
    </div>
  );
}
