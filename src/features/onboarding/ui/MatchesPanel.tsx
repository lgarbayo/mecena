"use client";
/**
 * Pyme onboarding: instead of a dossier, the aid the company already fits, refreshed every time the conversation
 * changes the company card (sector, place, legal form, size, what they want to finance). Same feed and same free
 * plan as /convocatorias: the free plan sees the top matches, the rest only as a count.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { API, ROUTES } from "@/contracts";
import type { CallsResponse } from "@/contracts/api";
import { apiGet } from "@/lib/api-client";
import { daysLeft, fitLabel } from "@/features/matching/labels";
import { FIT_COPY, deadlineLabel, isUrgent } from "@/features/matching/ui/format";
import { MATCHES_PANEL } from "../copy";
import s from "./onboarding.module.css";

const SHOWN = 3;

export function MatchesPanel({ profileId, appUserId, refreshKey, onCount, knowsEnough }: { profileId?: string; appUserId?: string; refreshKey: number; onCount?: (n: number) => void; knowsEnough?: boolean }) {
  const [data, setData] = useState<CallsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    const q = new URLSearchParams({ profileId, ...(appUserId ? { appUserId } : {}) });
    apiGet<CallsResponse>(`${API.calls}?${q}`)
      .then((r) => {
        if (!alive) return;
        setData((prev) => {
          const before = prev ? prev.results.length + prev.lockedCount : undefined;
          if (before !== undefined && before !== r.results.length + r.lockedCount) setPulse((p) => p + 1);
          return r;
        });
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [profileId, appUserId, refreshKey]);

  const total = data ? data.results.length + data.lockedCount : 0;
  useEffect(() => {
    if (data) onCount?.(total);
  }, [data, total, onCount]);

  const shown = data?.results.slice(0, SHOWN) ?? [];
  const rest = total - shown.length;

  return (
    <section className={`${s.panel} ${s.matches}`} aria-labelledby="matches-panel-title" aria-live="polite" data-testid="matches-panel">
      <header className={s.panelHead}>
        <h2 id="matches-panel-title">{MATCHES_PANEL.title}</h2>
        {data && (
          <span key={pulse} className={`${s.matchCount} ${pulse ? s.bump : ""}`} data-testid="matches-count">
            {total}
          </span>
        )}
      </header>
      {!data && !failed && <p className={s.muted}>{MATCHES_PANEL.loading}</p>}
      {failed && !data && <p className={s.muted}>{MATCHES_PANEL.failed}</p>}
      {data && total === 0 && <p className={s.muted}>{knowsEnough ? MATCHES_PANEL.none : MATCHES_PANEL.empty}</p>}
      {data && total > 0 && (
        <>
          <p className={s.matchLead}>{MATCHES_PANEL.count(total)}</p>
          <ul className={s.matchList}>
            {shown.map(({ call, match }) => {
              const days = daysLeft(call);
              const label = fitLabel(match.score);
              const gap = match.whatYouMiss[0];
              return (
                <li key={call.id}>
                  <Link href={ROUTES.call(call.id)} className={s.matchItem}>
                    <span className={s.matchTop}>
                      <strong>{call.title}</strong>
                      <span className={s.matchScore} aria-label={`${FIT_COPY[label]}: ${match.score} de 100`}>
                        {match.score}
                      </span>
                    </span>
                    <span className={s.matchFacts}>
                      <span>{call.amountText}</span>
                      <span className={isUrgent(days) ? s.urgent : undefined}>{deadlineLabel(call, days)}</span>
                    </span>
                    {/* As the rules wrote it: "Te falta: …" and "Confírmalo: …" mean different things. */}
                    {gap && <span className={s.matchGap}>{gap}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href={ROUTES.calls} className="btn btn-ghost" data-testid="matches-all">
            {rest > 0 ? MATCHES_PANEL.more(rest) : MATCHES_PANEL.seeAll}
          </Link>
        </>
      )}
    </section>
  );
}
