"use client";
/**
 * "Pregúntale a Mecena": the in-app agent (POST /api/agent) as a small bottom sheet, opened from a discreet floating
 * button. Same 8 tools as the MCP server. Text or dictation (Web Speech, es-ES), the reply with clickable links, and
 * which tools ran. History lives in this component only (the server never trusts it for identity).
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { API, ROUTES } from "@/contracts";
import type { AgentTurn as AgentResponse } from "@/features/agent/types";
import { useOptionalApp } from "@/components/shell/AppProvider";
import { useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { Icon } from "@/components/ui/icons";
import { LoadingRegion, SkeletonText } from "@/components/ui";
import { ApiClientError, apiSend } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import styles from "./agent.module.css";

type Turn = { role: "user" | "assistant"; content: string; tools?: AgentResponse["toolCalls"]; error?: boolean };

/** What each tool does, in the words the person would use. */
export const TOOL_LABELS: Record<string, string> = {
  get_profile: "Leer tu perfil",
  update_profile: "Actualizar tu perfil",
  build_dossier: "Preparar el dossier",
  export_dossier_pdf: "Exportar el PDF",
  search_calls: "Buscar convocatorias",
  explain_call: "Explicar las bases",
  draft_application: "Redactar la solicitud",
  score_application: "Tribunal simulado",
};

export const SUGGESTIONS = ["¿Qué convocatorias encajan conmigo?", "Hazme el dossier en PDF", "Explícame las bases de la que mejor encaja"];

/** Pages where the launcher would cover the page's own controls (sticky action bars, full-screen stages, paywall). */
const HIDDEN_ON = [ROUTES.login, ROUTES.onboarding, ROUTES.pricing, "/solicitud", "/tribunal", "/justificacion"];
export function launcherVisible(path: string | null | undefined): boolean {
  if (!path || path === ROUTES.home) return false;
  if (HIDDEN_ON.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  if (path.startsWith(`${ROUTES.calls}/`)) return false; // call detail: "Prepárame la solicitud" bar
  return true;
}

const URL_RE = /(https?:\/\/[^\s<>«»"')]+[^\s<>«»"').,;:])/g;

/** Text with its links made clickable; links to this site stay in this tab (they need the session). */
export function Linkified({ text }: { text: string }): ReactNode {
  const parts = text.split(URL_RE);
  return parts.map((p, i) => {
    if (i % 2 === 0) return p;
    let href = p;
    let sameSite = false;
    try {
      const u = new URL(p);
      sameSite = typeof window !== "undefined" && u.origin === window.location.origin;
      if (sameSite) href = `${u.pathname}${u.search}${u.hash}`;
    } catch {
      /* keep the raw text as href */
    }
    return (
      <a key={i} href={href} {...(sameSite ? {} : { target: "_blank", rel: "noreferrer" })}>
        {p.replace(/^https?:\/\//, "")}
      </a>
    );
  });
}

export function AgentSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  // one Idempotency-Key per question: a double tap or a network retry never runs the agent (and its tools) twice
  const lastError = useRef<unknown>(null);
  const ask = useAction(async (idempotencyKey: string, message: string, history: { role: Turn["role"]; content: string }[]) => {
    try {
      return await apiSend<AgentResponse>(API.agent, { message, history }, "POST", undefined, { idempotencyKey });
    } catch (e) {
      lastError.current = e;
      throw e;
    }
  });
  const busy = ask.pending;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const voice = useSpeechRecognition({ onFinal: (t) => setInput((prev) => `${prev} ${t}`.trim()) });
  const { stop: stopVoice } = voice;

  useEffect(() => {
    if (!open) {
      stopVoice();
      return;
    }
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, stopVoice]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [turns, busy]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      stopVoice();
      const history = turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content }));
      setTurns((t) => [...t, { role: "user", content: message }]);
      setInput("");
      lastError.current = null;
      let r: AgentResponse | undefined;
      let failure: unknown = null;
      try {
        r = await ask.run(message, history);
      } catch (e) {
        failure = e;
      }
      if (r) {
        const reply = r;
        setTurns((t) => [...t, { role: "assistant", content: reply.reply, tools: reply.toolCalls }]);
        return;
      }
      const e = failure ?? lastError.current;
      const msg =
        e instanceof ApiClientError && e.status === 429 ? e.message : "No he podido responder ahora mismo. Inténtalo de nuevo en unos segundos.";
      setTurns((t) => [...t, { role: "assistant", content: msg, error: true }]);
    },
    [busy, turns, stopVoice, ask],
  );

  const fullInput = voice.listening && voice.interim ? `${input} ${voice.interim}`.trim() : input;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(fullInput);
  };

  if (!open) return null;
  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="agent-title">
        <header className={styles.head}>
          <div className={styles.headMain}>
            <span className={`orb ${styles.headOrb}`} aria-hidden="true" />
            <div>
              <p className={styles.kicker}>Asistente</p>
              <h2 id="agent-title" className={styles.title}>
                Pregúntale a Mecena
              </h2>
            </div>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className={styles.log} aria-live="polite">
          {turns.length === 0 && (
            <div className={styles.empty}>
              <p>Busco convocatorias, te explico las bases, preparo tu dossier y tu solicitud. Mecena prepara; tú presentas.</p>
              <div className={styles.chips}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className={styles.chip} onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`${styles.turn} ${t.role === "user" ? styles.user : styles.bot} ${t.error ? styles.error : ""}`}>
              <p className={styles.text}>{t.role === "assistant" ? <Linkified text={t.content} /> : t.content}</p>
              {t.tools && t.tools.length > 0 && (
                <ul className={styles.tools} aria-label="Herramientas usadas">
                  {t.tools.map((c, j) => (
                    <li key={j} className={c.ok ? styles.toolOk : styles.toolKo}>
                      <Icon name={c.ok ? "check" : "alert"} size={13} />
                      <span className={styles.srOnly}>{c.ok ? "Hecho: " : "Falló: "}</span>
                      {TOOL_LABELS[c.name] ?? c.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {busy && (
            <LoadingRegion label="Mecena está trabajando…" className={`${styles.turn} ${styles.bot} ${styles.thinking}`}>
              <span className={`orb ${styles.thinkingOrb}`} aria-hidden="true" />
              <div className={styles.thinkingLines}>
                <SkeletonText lines={2} />
              </div>
            </LoadingRegion>
          )}
          <div ref={endRef} />
        </div>

        <form className={styles.form} onSubmit={onSubmit}>
          <label htmlFor="agent-input" className={styles.srOnly}>
            Tu mensaje
          </label>
          <textarea
            id="agent-input"
            ref={inputRef}
            className={styles.input}
            rows={1}
            maxLength={2000}
            placeholder={voice.listening ? "Te escucho…" : "Escribe o dicta tu pregunta"}
            value={fullInput}
            readOnly={voice.listening}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(fullInput);
              }
            }}
          />
          {voice.supported && (
            <button
              type="button"
              className={`${styles.iconBtn} ${voice.listening ? styles.listening : ""}`}
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? "Parar el dictado" : voice.tapToResume ? "Toca para seguir dictando" : "Dictar"}
            >
              <Icon name={voice.listening ? "stop" : "mic"} />
            </button>
          )}
          <button type="submit" className={styles.send} disabled={busy || !fullInput.trim()}>
            Enviar
          </button>
        </form>
        {(voice.error || (voice.tapToResume && "Toca el micrófono para seguir dictando.")) && (
          <p className={styles.voiceError}>{voice.error ?? "Toca el micrófono para seguir dictando."}</p>
        )}
      </section>
    </>
  );
}

/** The floating button (bottom right, above the navigation) plus the sheet. Only for signed-in users. */
export function AgentLauncher() {
  const app = useOptionalApp();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!app?.user || !launcherVisible(path)) return null;
  return (
    <>
      {!open && (
        <button type="button" className={styles.fab} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Pregúntale a Mecena" title="Pregúntale a Mecena">
          <span className={`orb ${styles.fabOrb}`} aria-hidden="true" />
          <Icon name="sparkle" size={22} />
        </button>
      )}
      <AgentSheet open={open} onClose={close} />
    </>
  );
}
