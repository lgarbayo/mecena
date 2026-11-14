"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/contracts";
import { HeaderEnd } from "./HeaderEnd";

/** Brand, mode switch and the account (initial + "Salir"). The sign-in page shows only the brand. */
export function Header() {
  const path = usePathname();
  const onLogin = path?.startsWith(ROUTES.login) ?? false;
  return (
    <header className="app-header">
      <Link href={onLogin ? ROUTES.login : ROUTES.home} className="brand">
        Mecena
      </Link>
      {!onLogin && <HeaderEnd />}
    </header>
  );
}
