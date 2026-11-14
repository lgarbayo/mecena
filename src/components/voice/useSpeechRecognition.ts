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
 *
 * iOS/iPadOS Safari is different: `continuous` is unreliable and a start() outside a user gesture often fails, so
 * there each session is single-shot and, when it ends, the hook stops and raises `tapToResume` for the UI to ask
 * for another tap.
 *
 * Android Chrome sometimes re-delivers the previous final verbatim or as the prefix of the next one (also across the
 * automatic restarts): there the last emitted final is remembered and only the new part is forwarded. Elsewhere a
 * repeated answer ("sí" to two questions) is real speech and passes; only the late final of a phrase already handed
 * out by flush() is trimmed, on every browser.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { voiceLog } from "./voiceLog";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort?(): void;
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

/** Errors a restart cannot fix: restarting would loop while the UI claims to be listening. */
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"]);
/** Error codes after which voice cannot work at all on this device/page: the UI should switch to typing. */
export const MIC_BLOCKED: ReadonlySet<string> = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);
/** A "no-speech" sooner than this after the session opened is a failure, not a pause. */
const SILENCE_MIN_MS = 1500;
const CUT = "El dictado se ha cortado. Pulsa de nuevo para seguir hablando.";
const UNSUPPORTED = "Tu navegador no permite dictado. Escribe tu respuesta.";

const ERROR_TEXT: Record<string, string | null> = {
  "not-allowed": "No tenemos acceso al micrófono. Actívalo en los ajustes del navegador o escribe tu historia.",
  "service-not-allowed": "No tenemos acceso al micrófono. Actívalo en los ajustes del navegador o escribe tu historia.",
  "audio-capture": "No encontramos micrófono. Escribe tu respuesta.",
  network: "Sin conexión para el dictado. Escribe tu respuesta.",
  "no-speech": "No te hemos oído bien. Acércate un poco o prueba a escribir.",
  "language-not-supported": "Este navegador no reconoce la voz en castellano. Escribe tu respuesta.",
  aborted: null, // what our own stop() causes: nothing to tell the person
};
const ERROR_FALLBACK = "El dictado ha fallado. Pulsa de nuevo o escribe tu respuesta.";

/** User-facing Spanish message for a SpeechRecognition error code (null when there is nothing to say). */
export function speechErrorText(code: string): string | null {
  return Object.prototype.hasOwnProperty.call(ERROR_TEXT, code) ? ERROR_TEXT[code] : ERROR_FALLBACK;
}

/** iPhone/iPad/iPod, including iPadOS that reports itself as a Mac (touch points give it away). SSR-safe. */
export function isIOS(nav?: Pick<Navigator, "userAgent" | "maxTouchPoints">): boolean {
  const n = nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  if (!n) return false;
  const ua = n.userAgent ?? "";
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (n.maxTouchPoints ?? 0) > 1);
}

/** Android (Chrome re-sends earlier finals there). SSR-safe. */
export function isAndroid(nav?: Pick<Navigator, "userAgent">): boolean {
  const n = nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
  return /Android/i.test(n?.userAgent ?? "");
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The part of `text` that is new after `last` was already emitted: "" for a repeat, the remainder when `text`
 * re-sends `last` as its prefix (only at a word boundary), otherwise `text` itself. Comparison ignores case and spacing.
 */
export function newFinalPart(last: string, text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  const prev = norm(last);
  if (!prev) return clean;
  const cur = clean.toLowerCase();
  if (cur === prev) return "";
  if (cur.startsWith(prev)) {
    const atBoundary = /[\s.,;:!?¡¿…]$/.test(prev) || /^[\s.,;:!?¡¿…]/.test(cur.slice(prev.length));
    if (atBoundary) return clean.slice(prev.length).replace(/^[\s.,;:!?…]+/, "").trim();
  }
  return clean;
}

function getCtor(): (new () => Rec) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useSpeechRecognition(opts: { onFinal: (text: string) => void; lang?: string }) {
  const [supported, setSupported] = useState(false);
  const [ios, setIos] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [tapToResume, setTapToResume] = useState(false);
  /** The live session, from start() until its onend. */
  const rec = useRef<Rec | null>(null);
  const wanted = useRef(false);
  const interimRef = useRef("");
  /** iOS only: start() came while the previous session was still stopping, so its onend opens the next one. */
  const resumeOnEnd = useRef(false);
  /** Last final handed out, across automatic restarts (Android re-sends it); cleared by start() after stop(). */
  const lastFinal = useRef("");
  /** Interim text flush() handed out: the engine's late final of that phrase must not be emitted again. */
  const flushed = useRef("");
  const stopped = useRef(true);
  /** Mirrors errorCode for the event handlers. */
  const code = useRef<string | null>(null);
  /** Counts consecutive error-triggered restarts without any speech result to prevent infinite restart loops. */
  const errorStreak = useRef(0);
  /** Session counter, for the debug trace only. */
  const sessions = useRef(0);
  const onFinal = useRef(opts.onFinal);
  onFinal.current = opts.onFinal;
  const lang = opts.lang ?? "es-ES";

  const setFailure = useCallback((c: string | null, text: string | null) => {
    code.current = c;
    setErrorCode(c);
    setError(text);
  }, []);

  useEffect(() => {
    setSupported(!!getCtor());
    setIos(isIOS());
  }, []);

  const open = useCallback(
    (Ctor: new () => Rec) => {
      const onIOS = isIOS();
      const onAndroid = isAndroid();
      const r = new Ctor();
      r.lang = lang;
      r.continuous = !onIOS;
      r.interimResults = true;
      // Track emitted finals per result index (Android re-sends earlier finals with resultIndex 0,
      // while WebKit/desktop may reuse index 0 after internal compaction or emit empty final tokens).
      const emittedAt = new Map<number, string>();
      const openedAt = Date.now();
      const sid = ++sessions.current;
      r.onstart = () => voiceLog(`#${sid} onstart`);
      r.onaudiostart = () => voiceLog(`#${sid} onaudiostart`);
      r.onspeechstart = () => voiceLog(`#${sid} onspeechstart`);
      r.onresult = (e) => {
        const last = e.results[e.results.length - 1];
        voiceLog(`#${sid} result ${last?.isFinal ? "final" : "interim"} [${e.resultIndex}/${e.results.length}] «${(last?.[0].transcript ?? "").slice(-40)}»${rec.current === r ? "" : " IGNORADO (sesión vieja)"}`);
        // A session replaced by restart() is gone: its late results were already handed out by flush().
        if (rec.current !== r) return;
        errorStreak.current = 0;
        for (const k of [...emittedAt.keys()]) {
          if (k >= e.results.length) emittedAt.delete(k);
        }
        let partial = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res.isFinal) {
            emittedAt.delete(i);
            partial += res[0].transcript;
          } else {
            const raw = res[0].transcript.trim();
            if (!raw) continue;
            if (emittedAt.get(i) === raw) continue; // the same final re-sent at the same index
            emittedAt.set(i, raw);
            const text = newFinalPart(onAndroid ? lastFinal.current : flushed.current, raw);
            lastFinal.current = raw;
            flushed.current = "";
            if (!text) continue;
            // Speech is getting through again: a transient complaint (no-speech...) is stale now.
            if (code.current && !FATAL.has(code.current) && rec.current === r) setFailure(null, null);
            onFinal.current(text);
          }
        }
        if (rec.current === r) {
          interimRef.current = partial;
          setInterim(partial);
        }
      };
      r.onerror = (e) => {
        voiceLog(`#${sid} error ${e.error}`);
        if (rec.current !== r) return; // a replaced session's late error is not the live one's
        if (e.error === "aborted" && resumeOnEnd.current) return; // old session aborted while a new tap is already queued
        if (FATAL.has(e.error)) wanted.current = false;
        // Silence is not a failure: the person is reading the next question or waiting for the answer. Chrome ends
        // the session with "no-speech" after a few quiet seconds and a fresh one takes over; only a no-speech that
        // comes right away (a broken mic loop) counts towards the cap.
        else if (e.error !== "no-speech" || Date.now() - openedAt < SILENCE_MIN_MS) errorStreak.current += 1;
        setFailure(e.error, speechErrorText(e.error));
      };
      r.onend = () => {
        voiceLog(`#${sid} onend${rec.current === r ? "" : " (sesión vieja)"}`);
        if (rec.current !== r) return; // a replaced session never restarts (it would fight the live one)
        rec.current = null;
        const pending = interimRef.current.trim();
        interimRef.current = "";
        setInterim("");
        if (pending && wanted.current) {
          lastFinal.current = pending;
          flushed.current = pending;
          onFinal.current(pending);
        }
        if (onIOS) {
          // No restart outside a user gesture on iOS: stop and ask for a tap (unless start() was already tapped).
          if (wanted.current && resumeOnEnd.current) {
            resumeOnEnd.current = false;
            open(Ctor);
            return;
          }
          resumeOnEnd.current = false;
          setTapToResume(wanted.current);
          wanted.current = false;
          setListening(false);
          return;
        }
        // Chrome stops after silence: a fresh session while the user still wants to talk (capped on repeated errors).
        if (wanted.current && errorStreak.current < 5) open(Ctor);
        else {
          wanted.current = false;
          setListening(false);
        }
      };
      rec.current = r;
      voiceLog(`#${sid} start() ${onIOS ? "iOS" : onAndroid ? "Android" : "desktop"} continuous=${r.continuous}`);
      try {
        r.start();
      } catch (err) {
        voiceLog(`#${sid} start() FALLÓ: ${err instanceof Error ? err.message : String(err)}`);
        rec.current = null;
        wanted.current = false;
        setListening(false);
        setFailure(null, CUT);
      }
    },
    [lang, setFailure],
  );

  const flush = useCallback(() => {
    const pending = interimRef.current.trim();
    voiceLog(`flush() ${pending ? `«${pending.slice(-40)}»` : "nada pendiente"}`);
    if (!pending) return;
    interimRef.current = "";
    setInterim("");
    // The engine still finalizes this phrase later: remembering it lets that late final be recognised as a repeat.
    lastFinal.current = pending;
    flushed.current = pending;
    onFinal.current(pending);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return setFailure(null, UNSUPPORTED);
    voiceLog(`start() pedido; sesión abierta: ${rec.current ? "sí" : "no"}`);
    if (stopped.current) lastFinal.current = flushed.current = ""; // a fresh conversation after an explicit stop
    stopped.current = false;
    errorStreak.current = 0;
    if (rec.current && !wanted.current) resumeOnEnd.current = true; // tapped again while the old session stops
    wanted.current = true;
    setFailure(null, null);
    setTapToResume(false);
    setListening(true);
    // Still running, or stopping after a pause: keep that session; its onend opens the next one.
    if (!rec.current) open(Ctor);
  }, [open, setFailure]);

  /**
   * A fresh session now, inside the current tap (call flush() first). iPhone Safari stops hearing after the first
   * phrase of a session without ending it, so the hook still looks like it is listening while nothing gets through;
   * each question therefore gets its own session, opened in the "Siguiente" tap that iOS requires.
   */
  const restart = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return setFailure(null, UNSUPPORTED);
    const old = rec.current;
    voiceLog(`restart() ${old ? "descarta la sesión anterior" : "sin sesión abierta"}`);
    rec.current = null; // detached: its late events are ignored
    try {
      if (old?.abort) old.abort();
      else old?.stop();
    } catch {
      /* already ended */
    }
    interimRef.current = "";
    setInterim("");
    stopped.current = false;
    errorStreak.current = 0;
    resumeOnEnd.current = false;
    wanted.current = true;
    setFailure(null, null);
    setTapToResume(false);
    setListening(true);
    open(Ctor);
  }, [open, setFailure]);

  const stop = useCallback(() => {
    voiceLog("stop()");
    wanted.current = false;
    stopped.current = true;
    resumeOnEnd.current = false;
    rec.current?.stop();
    interimRef.current = "";
    setListening(false);
    setTapToResume(false);
    setInterim("");
  }, []);

  useEffect(() => () => {
    wanted.current = false;
    rec.current?.stop();
  }, []);

  return { supported, listening, interim, error, errorCode, tapToResume, ios, start, stop, flush, restart };
}
