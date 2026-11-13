"use client";
import Link from "next/link";
import { ROUTES } from "@/contracts";
import { ModeSwitch } from "@/features/matching/ui/ModeSwitch";

export function Header() {
  return (
    <header className="app-header">
      <Link href={ROUTES.home} className="brand">
        Mecena
      </Link>
      <ModeSwitch />
    </header>
  );
}
