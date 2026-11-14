"use client";
/**
 * Compact live transcript for the stepped onboarding: what the person said (or typed), newest last, each line with
 * its save state (queued / sending / saved / failed + retry). Collapsed it shows the last few lines; "Ver todo" opens all.
 */
import { useState } from "react";
import type { QueuedTurn } from "../turnQueue";
import { STEPS_COPY as C } from "../steps";
import { ONBOARDING } from "../copy";
import s from "./live.module.css";

const COLLAPSED = 3;

export interface TranscriptLine {
  id: string;
  text: string;
  status: QueuedTurn["status"];
}

export function Transcript({ lines, interim, onRetry }: { lines: TranscriptLine[]; interim?: string; onRetry(id: string): void }) {
  const [open, setOpen] = useState(false);
  if (!lines.length && !interim) return null;
  const shown = open ? lines : lines.slice(-COLLAPSED);
  const hidden = lines.length - shown.length;
  return (
    <section className={s.transcript} aria-label={C.transcriptTitle}>
      <header className={s.transcriptHead}>
        <span className={s.kicker}>{C.transcriptTitle}</span>
        {(hidden > 0 || open) && lines.length > COLLAPSED && (
          <button type="button" className={s.textBtn} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? C.seeLess : C.seeAll(lines.length)}
          </button>
        )}
      </header>
      <ol className={s.lines} data-testid="transcript" aria-live="polite">
        {shown.map((l) => (
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
              <span className={s.lineStatus}>{C.turnStatus[l.status]}</span>
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
