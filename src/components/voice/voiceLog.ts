/**
 * On-device dictation trace for debugging on a real phone (no Web Inspector needed): open any page with ?voz=debug
 * and the onboarding shows what the browser's SpeechRecognition did, step by step. Off by default; costs nothing then.
 */
const MAX = 40;
let lines: string[] = [];
const listeners = new Set<(l: string[]) => void>();
let on: boolean | null = null;
const t0 = typeof performance !== "undefined" ? performance.now() : 0;

export function voiceDebugOn(): boolean {
  if (on !== null) return on;
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("voz");
    if (q === "debug") sessionStorage.setItem("voz-debug", "1");
    if (q === "off") sessionStorage.removeItem("voz-debug");
    on = sessionStorage.getItem("voz-debug") === "1";
  } catch {
    on = false;
  }
  return on;
}

export function voiceLog(msg: string): void {
  if (!voiceDebugOn()) return;
  const s = ((performance.now() - t0) / 1000).toFixed(1).padStart(6);
  lines = [...lines.slice(-(MAX - 1)), `${s}s ${msg}`];
  for (const l of listeners) l(lines);
}

export function subscribeVoiceLog(fn: (l: string[]) => void): () => void {
  listeners.add(fn);
  fn(lines);
  return () => listeners.delete(fn);
}
