"use client";
import { useEffect, useState } from "react";
import { subscribeVoiceLog, voiceDebugOn } from "./voiceLog";

/** The dictation trace on screen, only with ?voz=debug (see voiceLog.ts). */
export function VoiceDebug() {
  const [lines, setLines] = useState<string[] | null>(null);
  useEffect(() => (voiceDebugOn() ? subscribeVoiceLog((l) => setLines([...l])) : undefined), []);
  if (!lines) return null;
  return (
    <pre
      data-testid="voice-debug"
      style={{ position: "fixed", left: 8, right: 8, top: "calc(8px + env(safe-area-inset-top))", zIndex: 9999, maxHeight: "34dvh", overflow: "auto", margin: 0, padding: 8, font: "10px/1.35 ui-monospace, monospace", color: "#0f0", background: "rgba(0,0,0,0.82)", borderRadius: 8, whiteSpace: "pre-wrap", pointerEvents: "auto" }}
    >
      {navigator.userAgent.replace(/^Mozilla\/5\.0 /, "")}
      {"\n"}
      {lines.join("\n") || "(sin eventos todavía)"}
    </pre>
  );
}
