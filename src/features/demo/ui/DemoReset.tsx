"use client";
/** /demo: start the signed-in user's own account from scratch (nobody else's data is touched). */
import Link from "next/link";
import { useState } from "react";
import { API, ROUTES } from "@/contracts";
import { Button, Card } from "@/components/ui";
import { useApp } from "@/components/shell/AppProvider";
import { apiSend } from "@/lib/api-client";

export function DemoReset({ email }: { email: string }) {
  const { refresh } = useApp();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const reset = async () => {
    if (!window.confirm("Se borrarán tu perfil, tus obras, tu dossier y tus solicitudes. ¿Empezar de cero?")) return;
    setState("busy");
    try {
      await apiSend(API.demoReset, { scenario: "blank" });
      await refresh();
      setState("done");
    } catch {
      setState("error");
    }
  };
  return (
    <>
      <Card>
        <p style={{ marginTop: 0, color: "var(--g-ink-2)" }}>
          Empieza de cero con la cuenta <strong>{email}</strong>: se borran tu perfil, tus obras, tu dossier y tus solicitudes, y vuelve a salir la oferta de
          Mecena Pro. Las demás cuentas no se tocan.
        </p>
        <Button onClick={reset} disabled={state === "busy"}>
          {state === "busy" ? "Borrando…" : "Empezar de cero"}
        </Button>
        {state === "done" && (
          <p role="status">
            Listo. <a href={ROUTES.onboarding}>Empieza la entrevista</a>.
          </p>
        )}
        {state === "error" && <p role="alert">No se ha podido reiniciar. Prueba otra vez.</p>}
      </Card>
      <Card>
        <h2 style={{ marginTop: 0 }}>Pantallas principales</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <Link href={ROUTES.home} className="btn btn-ghost">
            Portada
          </Link>
          <Link href={ROUTES.onboarding} className="btn btn-ghost">
            Hablar / Alta
          </Link>
          <Link href={ROUTES.works} className="btn btn-ghost">
            Obras
          </Link>
          <Link href={ROUTES.dossier} className="btn btn-ghost">
            Dossier
          </Link>
          <Link href={ROUTES.calls} className="btn btn-ghost">
            Convocatorias
          </Link>
          <Link href={ROUTES.pricing} className="btn btn-ghost">
            Mecena Pro
          </Link>
          <Link href={ROUTES.trust} className="btn btn-ghost">
            Confianza
          </Link>
        </div>
      </Card>
    </>
  );
}
