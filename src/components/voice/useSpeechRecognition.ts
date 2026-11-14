"use client";
/**
 * Web Speech API hook (scaffold-owned, es-ES). Used by onboarding (WP-01) and works (WP-02).
 * Emits final chunks through onFinal; `interim` is the live partial text. `supported` is false on
 * browsers without SpeechRecognition (Firefox, some in-app browsers): show the text fallback then.
 * Chrome on Android needs HTTPS (or localhost) for the microphone.
 *
 * One recognition session at a time: the browser ends sessions on its own (silence, errors), and while the person
 * still wants to talk a FRESH session replaces the one that ended. A session that is no longer current never
 * restarts, and errors that would repeat on every restart (no permission, no mic, offline) stop instead of looping.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

/** Errors a restart cannot fix: restarting would loop while the UI claims to be listening. */
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"]);
const CUT = "El dictado se ha cortado. Pulsa de nuevo para seguir hablando.";

function getCtor(): (new () => Rec) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useSpeechRecognition(opts: { onFinal: (text: string) => void; lang?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The live session, from start() until its onend. */
  const rec = useRef<Rec | null>(null);
  const wanted = useRef(false);
  const interimRef = useRef("");
  const onFinal = useRef(opts.onFinal);
  onFinal.current = opts.onFinal;
  const lang = opts.lang ?? "es-ES";

  useEffect(() => setSupported(!!getCtor()), []);

  const open = useCallback(
    (Ctor: new () => Rec) => {
      const r = new Ctor();
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      // Track emitted finals per result index (Android re-sends earlier finals with resultIndex 0,
      // while WebKit/desktop may reuse index 0 after internal compaction or emit empty final tokens).
      const emittedAt = new Map<number, string>();
      r.onresult = (e) => {
        if (e.results.length < emittedAt.size) {
          for (const k of [...emittedAt.keys()]) {
            if (k >= e.results.length) emittedAt.delete(k);
          }
        }
        let partial = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res.isFinal) {
            partial += res[0].transcript;
          } else {
            const text = res[0].transcript.trim();
            if (!text) continue;
            const prev = emittedAt.get(i);
            if (prev === text) continue;
            emittedAt.set(i, text);
            const delta = prev && text.startsWith(prev) ? text.slice(prev.length).trim() : text;
            if (delta) onFinal.current(delta);
          }
        }
        if (rec.current === r) {
          interimRef.current = partial;
          setInterim(partial);
          setError(null);
        }
      };
      r.onerror = (e) => {
        if (rec.current !== r) return;
        if (FATAL.has(e.error)) wanted.current = false;
        if (e.error === "no-speech" || e.error === "aborted") return;
        setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Permite el micrófono para hablar con Mecena." : `Dictado: ${e.error}`);
      };
      r.onend = () => {
        if (rec.current !== r) return; // a replaced session never restarts (it would fight the live one)
        rec.current = null;
        const pending = interimRef.current.trim();
        interimRef.current = "";
        setInterim("");
        if (pending && wanted.current) onFinal.current(pending);
        // Chrome stops after silence: a fresh session while the user still wants to talk.
        if (wanted.current) open(Ctor);
        else setListening(false);
      };
      rec.current = r;
      try {
        r.start();
      } catch {
        rec.current = null;
        wanted.current = false;
        setListening(false);
        setError(CUT);
      }
    },
    [lang],
  );

  const flush = useCallback(() => {
    const pending = interimRef.current.trim();
    if (!pending) return;
    interimRef.current = "";
    setInterim("");
    onFinal.current(pending);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return setError("Tu navegador no permite dictado. Escribe tu respuesta.");
    wanted.current = true;
    setError(null);
    setListening(true);
    // Still running, or stopping after a pause: keep that session; its onend opens the next one.
    if (!rec.current) open(Ctor);
  }, [open]);

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop();
    interimRef.current = "";
    setListening(false);
    setInterim("");
  }, []);

  useEffect(() => () => {
    wanted.current = false;
    rec.current?.stop();
  }, []);

  return { supported, listening, interim, error, start, stop, flush };
}
