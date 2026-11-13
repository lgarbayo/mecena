"use client";
/**
 * Web Speech API hook (scaffold-owned, es-ES). Used by onboarding (WP-01) and works (WP-02).
 * Emits final chunks through onFinal; `interim` is the live partial text. `supported` is false on
 * browsers without SpeechRecognition (Firefox, some in-app browsers): show the text fallback then.
 * Chrome on Android needs HTTPS (or localhost) for the microphone.
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
  const rec = useRef<Rec | null>(null);
  const wanted = useRef(false);
  const onFinal = useRef(opts.onFinal);
  onFinal.current = opts.onFinal;

  useEffect(() => setSupported(!!getCtor()), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return setError("Tu navegador no permite dictado. Escribe tu respuesta.");
    const r = new Ctor();
    r.lang = opts.lang ?? "es-ES";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) onFinal.current(res[0].transcript.trim());
        else partial += res[0].transcript;
      }
      setInterim(partial);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Permite el micrófono para hablar con Mecena." : `Dictado: ${e.error}`);
    // Chrome stops after silence: restart while the user still wants to talk.
    r.onend = () => (wanted.current ? r.start() : setListening(false));
    rec.current = r;
    wanted.current = true;
    setError(null);
    r.start();
    setListening(true);
  }, [opts.lang]);

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  useEffect(() => () => {
    wanted.current = false;
    rec.current?.stop();
  }, []);

  return { supported, listening, interim, error, start, stop };
}
