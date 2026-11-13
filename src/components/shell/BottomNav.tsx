"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/contracts";

const ITEMS = [
  { href: ROUTES.onboarding, label: "Hablar" },
  { href: ROUTES.works, label: "Obras" },
  { href: ROUTES.dossier, label: "Dossier" },
  { href: ROUTES.calls, label: "Convocatorias" },
  { href: ROUTES.pricing, label: "Pro" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Principal">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={path?.startsWith(i.href) ? "active" : ""}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
