"use client";
import Link from "next/link";
import { ROUTES } from "@/contracts";
import { ModeSwitch } from "@/features/matching/ui/ModeSwitch";
import { useOptionalApp } from "./AppProvider";

/**
 * Right side of the header: the Creador/a <-> Pyme switch and the account (initial, a link to /cuenta, + "Salir"). Shared by the app
 * header and the full-screen home, which hides that header (globals.css) and so must carry its own copy.
 * Renders nothing outside <AppProvider> (the home screen in tests). Signed out (the public home and /confianza): "Entrar".
 */
export function HeaderEnd() {
  const app = useOptionalApp();
  if (!app) return null;
  const { user, ready, logout } = app;
  if (ready && !user)
    return (
      <div className="header-end">
        <Link href={ROUTES.login} className="account-out">
          Entrar
        </Link>
      </div>
    );
  return (
    <div className="header-end">
      <ModeSwitch />
      {user && (
        <div className="account">
          <Link href={ROUTES.account} className="account-link" title={`${user.email} · Cuenta y Conectar con Claude`} aria-label={`Cuenta de ${user.email}`}>
            <span className="account-initial" aria-hidden="true">
              {user.email.charAt(0).toUpperCase()}
            </span>
            <span className="account-email">{user.email}</span>
          </Link>
          <button type="button" className="account-out" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
