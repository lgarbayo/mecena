"use client";
/** /demo: start the signed-in user's own account from scratch (nobody else's data is touched). */
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
    <Card>
      <p>
        Empieza de cero con la cuenta <strong>{email}</strong>: se borran tu perfil, tus obras, tu dossier y tus solicitudes, y vuelve a salir la
        oferta de Mecena Pro. Las demás cuentas no se tocan.
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
  );
}
