"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/contracts";
import { NAV } from "@/features/onboarding/copy";
import { Icon, type IconName } from "@/components/ui/icons";
import { useApp } from "./AppProvider";

const NAV_ICONS: Record<(typeof NAV)["creator"][number]["key"], IconName> = {
  onboarding: "chat",
  works: "image",
  dossier: "doc",
  calls: "search",
  pricing: "star",
};

/** Main navigation. A pyme sees its company card and the aid it fits; works and dossier are for creators. */
export function BottomNav() {
  const path = usePathname();
  const { profile } = useApp();
  if (path?.startsWith(ROUTES.login)) return null; // no navigation before signing in
  const kind = profile?.kind ?? "creator";
  const items = NAV[kind];
  return (
    <nav className="bottom-nav" aria-label="Principal">
      {items.map((i) => {
        const href = ROUTES[i.key];
        const active = path?.startsWith(href) ?? false;
        return (
          <Link key={i.key} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <Icon name={kind === "business" && i.key === "onboarding" ? "building" : NAV_ICONS[i.key]} size={20} />
            <span>{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
