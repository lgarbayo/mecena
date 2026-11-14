"use client";
/**
 * "Borrar mi cuenta", with a confirmation step. Shown only signed in (on /confianza, which is also public).
 * DELETE /api/auth/me removes the account and everything it owns, photos included, then signs out.
 */
import { useRef, useState } from "react";
import { API, ROUTES } from "@/contracts";
import { useOptionalApp } from "@/components/shell/AppProvider";
import { ApiClientError, apiSend } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import styles from "./auth.module.css";

export function DeleteAccount() {
  const app = useOptionalApp();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<string>();
  const lastError = useRef<unknown>(null);
  const del = useAction(async (idempotencyKey: string) => {
    try {
      await apiSend(API.authMe, { confirm: true }, "DELETE", undefined, { idempotencyKey });
      return true;
    } catch (e) {
      lastError.current = e;
      throw e;
    }
  });
  if (!app?.user) return null;

  const remove = async () => {
    if (step === "busy") return;
    setStep("busy");
    setError(undefined);
    lastError.current = null;
    let failure: unknown = null;
    let ok = false;
    try {
      ok = !!(await del.run());
    } catch (e) {
      failure = e;
    }
    if (ok) return window.location.assign(ROUTES.home);
    const e = failure ?? lastError.current;
    setError(e instanceof ApiClientError ? e.message : "No hemos podido borrar tu cuenta. Prueba otra vez.");
    setStep("confirm");
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
