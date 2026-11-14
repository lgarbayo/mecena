"use client";
/**
 * "Borrar mi cuenta", with a confirmation step. Shown only signed in (on /confianza, which is also public).
 * DELETE /api/auth/me removes the account and everything it owns, photos included, then signs out.
 */
import { useState } from "react";
import { API, ROUTES } from "@/contracts";
import { useOptionalApp } from "@/components/shell/AppProvider";
import { ApiClientError, apiSend } from "@/lib/api-client";
import styles from "./auth.module.css";

export function DeleteAccount() {
  const app = useOptionalApp();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<string>();
  if (!app?.user) return null;

  const remove = async () => {
    setStep("busy");
    setError(undefined);
    try {
      await apiSend(API.authMe, { confirm: true }, "DELETE");
      window.location.assign(ROUTES.home);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "No hemos podido borrar tu cuenta. Prueba otra vez.");
      setStep("confirm");
    }
  };

  return (
    <section className={styles.danger} aria-labelledby="delete-account-title" data-testid="delete-account">
      <h2 id="delete-account-title">Tu cuenta</h2>
      <p>
        Entraste como <strong>{app.user.email}</strong>.
      </p>
      {step === "idle" ? (
        <button type="button" className="btn btn-quiet" onClick={() => setStep("confirm")}>
          Borrar mi cuenta
        </button>
      ) : (
        <div className={styles.confirm} role="alertdialog" aria-labelledby="delete-account-title" aria-describedby="delete-account-warning">
          <p id="delete-account-warning">
            Vamos a borrar tu cuenta, tu perfil, tus textos, tu dossier, tus solicitudes y las fotos de tus obras. No se puede deshacer.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.confirmActions}>
            <button type="button" className={`btn btn-primary ${styles.destructive}`} onClick={() => void remove()} disabled={step === "busy"}>
              {step === "busy" ? "Borrando…" : "Sí, borrar mi cuenta"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep("idle")} disabled={step === "busy"}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
