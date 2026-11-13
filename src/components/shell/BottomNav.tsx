"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/contracts";
import { NAV } from "@/features/onboarding/copy";
import { useApp } from "./AppProvider";

/** Main navigation. A pyme sees its company card and the aid it fits; works and dossier are for creators. */
export function BottomNav() {
  const path = usePathname();
  const { profile } = useApp();
  const items = NAV[profile?.kind ?? "creator"];
  return (
    <nav className="bottom-nav" aria-label="Principal">
      {items.map((i) => {
        const href = ROUTES[i.key];
        return (
          <Link key={i.key} href={href} className={path?.startsWith(href) ? "active" : ""}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
