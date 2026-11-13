"use client";
import { PageTitle } from "@/components/ui";
import { useApp } from "@/components/shell/AppProvider";

/** "Convocatorias" for creators; a pyme looks for "ayudas" (subvenciones, bonos, préstamos) for its company. */
export function CallsTitle() {
  const business = useApp().profile?.kind === "business";
  return <PageTitle kicker={business ? "Para tu empresa" : "Para ti"}>{business ? "Ayudas y subvenciones" : "Convocatorias"}</PageTitle>;
}
