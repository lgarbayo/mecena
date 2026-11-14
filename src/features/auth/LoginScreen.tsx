"use client";
/**
 * /entrar: email + password, "Entrar" or "Crear cuenta". After success, back to ?next (or home) with a full reload.
 * `kind` is the profile chosen on the first screen (?perfil=creador|pyme): a new account starts with it and a login
 * switches to it. Sign-up without it (a direct link) asks for it in the form, so every account starts in its own mode.
 */
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { API, ROUTES, safeNext, type ProfileKind } from "@/contracts";
import type { MeResponse } from "@/contracts/api";
import { Button, Card, PageTitle } from "@/components/ui";
import { ApiClientError, apiSend } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import styles from "./auth.module.css";

type Mode = "login" | "signup";

const KIND_LABEL: Record<ProfileKind, string> = { creator: "Creador/a", business: "Pyme o autónomo/a" };

export function LoginScreen({
  next,
  signupCodeRequired,
  signupCodeAccepted = signupCodeRequired,
  initialMode = "login",
  kind: chosenKind,
}: {
  next: string;
  signupCodeRequired: boolean;
  signupCodeAccepted?: boolean; // show the field as optional (open sign-up, but a code can still gift credits)
  initialMode?: Mode;
  kind?: ProfileKind;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<ProfileKind | undefined>(chosenKind);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false); // signed in: the button stays locked until the page reloads
  const signup = mode === "signup";
  // sign-up carries an Idempotency-Key (a double tap never creates the account twice); login is just guarded
  const lastError = useRef<unknown>(null);
  const send = useAction(async (idempotencyKey: string, url: string, body: Record<string, string>) => {
    try {
      return await apiSend<MeResponse>(url, body, "POST", undefined, { idempotencyKey });
    } catch (e) {
      lastError.current = e;
      throw e;
    }
  });
  const busy = send.pending || leaving;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (busy) return;
    if (signup && !kind) return setError("Elige si eres creador/a o pyme.");
    if (signup && password.length < 8) return setError("La contraseña necesita al menos 8 caracteres.");
    lastError.current = null;
    let ok = false;
    let failure: unknown = null;
    try {
      // a login only switches profile when one was chosen on the first screen; otherwise it keeps the last one used
      const body: Record<string, string> = signup
        ? { email, password, ...(kind ? { kind } : {}), ...(signupCodeAccepted && code.trim() ? { code } : {}) }
        : { email, password, ...(chosenKind ? { kind: chosenKind } : {}) };
      ok = !!(await send.run(signup ? API.authSignup : API.authLogin, body));
    } catch (err) {
      failure = err;
    }
    if (ok) {
      setLeaving(true);
      window.location.assign(safeNext(next)); // checked again here: never leave the site after signing in
      return;
    }
    const err = failure ?? lastError.current;
    setError(err instanceof ApiClientError ? friendly(err) : "No hemos podido conectar. Revisa tu conexión y prueba otra vez.");
  };

  const choose = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <div className={styles.wrap}>
      <PageTitle kicker="Tu cuenta">{signup ? "Crea tu cuenta" : "Entra en Mecena"}</PageTitle>
      <p className={styles.lead}>
        {signup ? (kind === "business" ? "Los datos de tu empresa y tus solicitudes son solo tuyos." : "Tu perfil, tus obras y tus solicitudes son solo tuyos.") : "Sigue donde lo dejaste."}
      </p>
      {chosenKind && (
        <p className={styles.chosen} data-testid="chosen-kind">
          Perfil: <strong>{KIND_LABEL[chosenKind]}</strong> · <Link href={ROUTES.start}>Cambiar</Link>
        </p>
      )}
      <Card className={styles.card}>
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
          {signup && !chosenKind && (
            <div className={styles.field} role="group" aria-label="¿Qué eres?">
              <span>¿Qué eres?</span>
              <div className={styles.kinds}>
                {(["creator", "business"] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`signup-kind-${k}`}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {signup && signupCodeAccepted && (
            <label className={styles.field}>
              <span>{signupCodeRequired ? "Código de invitación" : "Código de invitación (opcional)"}</span>
              <input type="text" name="code" autoComplete="off" required={signupCodeRequired} value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
          )}
          {signup && signupCodeAccepted && !signupCodeRequired && <p className={styles.hint}>Si te han dado uno, puede regalarte créditos premium.</p>}
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
      <p className={styles.foot}>
        Mecena prepara; tú presentas. <Link href={ROUTES.trust}>{kind === "business" ? "Cómo cuidamos tus datos" : "Cómo cuidamos tu obra y tus datos"}</Link>
      </p>
    </div>
  );
}

function friendly(e: ApiClientError): string {
  if (e.status === 400) return e.message.replace(/^[\w.]+: /, "").replace(/; [\w.]+: /g, ". ");
  return e.message;
}
