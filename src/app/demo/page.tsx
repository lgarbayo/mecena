"use client";
import Link from "next/link";
import { useState } from "react";
import { API, ROUTES } from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";
import { Button, Card, PageTitle } from "@/components/ui";
import { apiSend } from "@/lib/api-client";

export default function Page() {
  const { refresh } = useApp();
  const [busy, setBusy] = useState<"blank" | "onboarded" | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const runReset = async (scenario: "blank" | "onboarded") => {
    setBusy(scenario);
    setStatus(null);
    try {
      await apiSend(API.demoReset, { scenario });
      await refresh();
      setStatus(scenario === "blank" ? "Demo reiniciada desde cero." : "Perfil de demostración restaurado.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "No se pudo reiniciar la demo.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageTitle kicker="Demo">Panel de control</PageTitle>
      <Card>
        <p style={{ marginTop: 0, color: "var(--g-ink-2)" }}>
          Reinicia la base de datos de demostración y rota el identificador de usuario para probar el recorrido completo desde cualquier pantalla.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "14px" }}>
          <Button onClick={() => runReset("onboarded")} disabled={busy !== null}>
            {busy === "onboarded" ? "Restaurando…" : "Restaurar perfil de demo"}
          </Button>
          <Button variant="ghost" onClick={() => runReset("blank")} disabled={busy !== null}>
            {busy === "blank" ? "Reiniciando…" : "Reiniciar desde cero"}
          </Button>
        </div>
        {status && (
          <p style={{ margin: "14px 0 0", color: "var(--g-accent-3)", fontWeight: 600 }} role="status">
            {status}
          </p>
        )}
      </Card>
      <Card>
        <h2 style={{ marginTop: 0 }}>Pantallas principales</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <Link href={ROUTES.home} className="btn btn-ghost">Portada</Link>
          <Link href={ROUTES.onboarding} className="btn btn-ghost">Hablar / Alta</Link>
          <Link href={ROUTES.works} className="btn btn-ghost">Obras</Link>
          <Link href={ROUTES.dossier} className="btn btn-ghost">Dossier</Link>
          <Link href={ROUTES.calls} className="btn btn-ghost">Convocatorias</Link>
          <Link href={ROUTES.pricing} className="btn btn-ghost">Mecena Pro</Link>
          <Link href={ROUTES.trust} className="btn btn-ghost">Confianza</Link>
        </div>
      </Card>
    </>
  );
}
