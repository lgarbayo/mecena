"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/contracts";
import { ModeSwitch } from "@/features/matching/ui/ModeSwitch";
import { useApp } from "./AppProvider";

/** Brand, mode switch and the account (initial + "Salir"). The sign-in page shows only the brand. */
export function Header() {
  const path = usePathname();
  const { user, logout } = useApp();
  const onLogin = path?.startsWith(ROUTES.login) ?? false;
  return (
    <header className="app-header">
      <Link href={onLogin ? ROUTES.login : ROUTES.home} className="brand">
        Mecena
      </Link>
      {!onLogin && (
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
      )}
    </header>
  );
}
