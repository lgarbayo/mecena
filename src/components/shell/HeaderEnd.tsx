"use client";
import { ModeSwitch } from "@/features/matching/ui/ModeSwitch";
import { useOptionalApp } from "./AppProvider";

/**
 * Right side of the header: the Creador/a <-> Pyme switch and the account (initial + "Salir"). Shared by the app
 * header and the full-screen home, which hides that header (globals.css) and so must carry its own copy.
 * Renders nothing outside <AppProvider> (the home screen in tests).
 */
export function HeaderEnd() {
  const app = useOptionalApp();
  if (!app) return null;
  const { user, logout } = app;
  return (
    <div className="header-end">
      <ModeSwitch />
      {user && (
        <div className="account">
          <span className="account-initial" title={user.email} aria-label={`Sesión de ${user.email}`}>
            {user.email.charAt(0).toUpperCase()}
          </span>
          <span className="account-email">{user.email}</span>
          <button type="button" className="account-out" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
