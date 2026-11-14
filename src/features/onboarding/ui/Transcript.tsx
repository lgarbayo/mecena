"use client";
/**
 * Compact live transcript for the stepped onboarding: what the person said (or typed), newest last, each line with
 * its save state (queued / sending / saved / failed + retry). Every line stays in a short box that follows the
 * newest one, so it never pushes the rest of the screen down on a phone.
 */
import { useEffect, useRef } from "react";
import type { QueuedTurn } from "../turnQueue";
import { STEPS_COPY as C } from "../steps";
import { ONBOARDING } from "../copy";
import s from "./live.module.css";

export interface TranscriptLine {
  id: string;
  text: string;
  status: QueuedTurn["status"];
}

export function Transcript({ lines, interim, onRetry }: { lines: TranscriptLine[]; interim?: string; onRetry(id: string): void }) {
  const box = useRef<HTMLOListElement>(null);
  const last = `${lines.length}|${lines.at(-1)?.status}|${interim ?? ""}`;
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last]);
  if (!lines.length && !interim) return null;
  return (
    <section className={s.transcript} aria-label={C.transcriptTitle}>
      <ol ref={box} className={s.lines} data-testid="transcript" aria-live="polite">
        {lines.map((l) => (
          <li key={l.id} className={s.line} data-status={l.status}>
            <span className={s.lineText}>{l.text}</span>
            {l.status === "failed" ? (
              <span className={s.lineFailed} role="alert">
                {C.turnStatus.failed}
                <button type="button" className={s.retry} onClick={() => onRetry(l.id)}>
                  {ONBOARDING.retry}
                </button>
              </span>
            ) : (
              <span className={s.lineStatus} aria-label={C.turnStatus[l.status]} />
            )}
          </li>
        ))}
        {interim && (
          <li className={`${s.line} ${s.interim}`} data-status="interim">
            <span className={s.lineText}>{interim}</span>
          </li>
        )}
      </ol>
    </section>
  );
}
