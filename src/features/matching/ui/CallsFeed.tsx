"use client";
// WP-06 feed: ranked matches for the active profile; the free plan sees 3, the rest are blurred behind the paywall.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API, ROUTES } from "@/contracts";
import type { CallsResponse } from "@/contracts/api";
import { useApp } from "@/components/shell/AppProvider";
import { Button, Spinner } from "@/components/ui";
import { Paywall } from "@/features/purchases/ui/Paywall";
import { apiGet } from "@/lib/api-client";
import { daysLeft, fitLabel } from "../labels";
import s from "./calls.module.css";
import { FIT_COPY, deadlineLabel, isUrgent } from "./format";

type Result = CallsResponse["results"][number];

export function CallCard({ call, match }: Result) {
  const label = fitLabel(match.score);
  const days = daysLeft(call);
  return (
    <Link href={ROUTES.call(call.id)} className={s.card}>
      <div className={s.top}>
        <div>
          <h2 className={s.title}>{call.title}</h2>
          <p className={s.organizer}>{call.organizer}</p>
        </div>
        <span className={`${s.fitTag} ${s[`fit-${label}`]}`} aria-label={`${FIT_COPY[label]}: ${match.score} de 100`}>
          <b>{match.score}</b>
          {label}
        </span>
      </div>
      <div className={s.facts}>
        <span>
          <strong>{call.amountText}</strong>
        </span>
        <span className={isUrgent(days) ? s.urgent : undefined}>{deadlineLabel(call, days)}</span>
      </div>
      {match.whyYouFit.length > 0 && (
        <>
          <p className={s.sectionLabel}>Por qué encajas</p>
          <ul className={`${s.list} ${s.fit}`}>
            {match.whyYouFit.slice(0, 2).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </>
      )}
      {match.whatYouMiss.length > 0 && (
        <>
          <p className={s.sectionLabel}>Qué te falta</p>
          <ul className={`${s.list} ${s.miss}`}>
            {match.whatYouMiss.slice(0, 2).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </>
      )}
    </Link>
  );
}

function LockedCard({ onOpen }: { onOpen(): void }) {
  return (
    <button type="button" className={s.locked} onClick={onOpen} aria-label="Ver más convocatorias con Mecena Pro">
      <div className={s.lockedBody} aria-hidden>
        <div className={s.lockedBar} style={{ width: "70%" }} />
        <div className={s.lockedBar} style={{ width: "45%" }} />
        <div className={s.lockedBar} style={{ width: "85%" }} />
      </div>
      <span className={s.lockedOverlay}>
        <strong>Otra convocatoria encaja contigo</strong>
        <span>Desbloquéala con Mecena Pro</span>
      </span>
    </button>
  );
}

export function CallsFeed() {
  const { profile, appUserId } = useApp();
  const [data, setData] = useState<CallsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const q = new URLSearchParams({ profileId: profile.id, ...(appUserId ? { appUserId } : {}) });
      setData(await apiGet<CallsResponse>(`${API.calls}?${q}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las convocatorias");
    }
  }, [profile, appUserId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (error)
    return (
      <p className={s.empty}>
        {error}{" "}
        <Button variant="quiet" onClick={load}>
          Reintentar
        </Button>
      </p>
    );
  if (!data) return <Spinner label="Buscando convocatorias para ti…" />;

  const total = data.results.length + data.lockedCount;
  return (
    <>
      <p className={s.modeLine}>
        <span>{data.mode === "creator" ? "Para artistas y creadores" : "Para pymes y autónomos"}</span>
        <span>
          {total} {total === 1 ? "encaja" : "encajan"} contigo
        </span>
      </p>
      {total === 0 && (
        <p className={s.empty}>
          Aún no encontramos convocatorias para tu perfil. Cuéntanos más sobre ti en el <Link href={ROUTES.onboarding}>alta</Link>.
        </p>
      )}
      {data.results.map((r) => (
        <CallCard key={r.call.id} {...r} />
      ))}
      {Array.from({ length: data.lockedCount }, (_, i) => (
        <LockedCard key={i} onOpen={() => setPaywall(true)} />
      ))}
      <Paywall
        open={paywall}
        trigger="match_limit"
        onClose={() => setPaywall(false)}
        onPurchased={() => {
          setPaywall(false);
          load();
        }}
      />
    </>
  );
}
