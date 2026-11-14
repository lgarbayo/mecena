"use client";
/** /entrar: email + password, "Entrar" or "Crear cuenta". After success, back to ?next (or home) with a full reload. */
import { useState, type FormEvent } from "react";
import { API, safeNext } from "@/contracts";
import type { MeResponse } from "@/contracts/api";
import { Button, Card, PageTitle } from "@/components/ui";
import { ApiClientError, apiSend } from "@/lib/api-client";
import styles from "./auth.module.css";

type Mode = "login" | "signup";

export function LoginScreen({ next, signupCodeRequired, initialMode = "login" }: { next: string; signupCodeRequired: boolean; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (signup && password.length < 8) return setError("La contraseña necesita al menos 8 caracteres.");
    setBusy(true);
    try {
      const body = signup ? { email, password, ...(signupCodeRequired ? { code } : {}) } : { email, password };
      await apiSend<MeResponse>(signup ? API.authSignup : API.authLogin, body);
      window.location.assign(safeNext(next)); // checked again here: never leave the site after signing in
    } catch (err) {
      setError(err instanceof ApiClientError ? friendly(err) : "No hemos podido conectar. Revisa tu conexión y prueba otra vez.");
      setBusy(false);
    }
  };

  const choose = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <div className={styles.wrap}>
      <PageTitle kicker="Tu cuenta">{signup ? "Crea tu cuenta" : "Entra en Mecena"}</PageTitle>
      <p className={styles.lead}>{signup ? "Tu perfil, tus obras y tus solicitudes son solo tuyos." : "Sigue donde lo dejaste."}</p>
      <Card>
        <div className={styles.tabs} role="tablist" aria-label="Entrar o crear cuenta">
          <button type="button" role="tab" aria-selected={!signup} onClick={() => choose("login")}>
            Entrar
          </button>
          <button type="button" role="tab" aria-selected={signup} onClick={() => choose("signup")}>
            Crear cuenta
          </button>
        </div>
        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.field}>
            <span>Email</span>
            <input type="email" name="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Contraseña</span>
            <input
              type="password"
              name="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={signup ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {signup && <p className={styles.hint}>Al menos 8 caracteres.</p>}
          {signup && signupCodeRequired && (
            <label className={styles.field}>
              <span>Código de invitación</span>
              <input type="text" name="code" autoComplete="off" required value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className={styles.submit} disabled={busy}>
            {busy ? (signup ? "Creando tu cuenta…" : "Entrando…") : signup ? "Crear cuenta" : "Entrar"}
          </Button>
        </form>
      </Card>
      <p className={styles.foot}>Mecena prepara; tú presentas.</p>
    </div>
  );
}

function friendly(e: ApiClientError): string {
  if (e.status === 400) return e.message.replace(/^[\w.]+: /, "").replace(/; [\w.]+: /g, ". ");
  return e.message;
}
