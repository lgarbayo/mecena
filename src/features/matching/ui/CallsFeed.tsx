"use client";
// WP-06 feed: ranked matches for the active profile; the free plan sees 3, the rest are blurred behind the paywall.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API, ROUTES } from "@/contracts";
import type { CallsResponse } from "@/contracts/api";
import { useApp } from "@/components/shell/AppProvider";
import { Button, Spinner } from "@/components/ui";
import { Paywall } from "@/features/purchases/ui/Paywall";
import { DeepResearchPanel } from "@/features/deep-research/ui/DeepResearchPanel";
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
          <p className={s.organizer}>
            {call.organizer}
            {call.source === "bdns" && <span className={s.sourceTag}> · BDNS, sin revisión manual</span>}
          </p>
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

function LockedCard({ onOpen, business }: { onOpen(): void; business?: boolean }) {
  return (
    <button type="button" className={s.locked} onClick={onOpen} aria-label={business ? "Ver más ayudas con Mecena Pro" : "Ver más convocatorias con Mecena Pro"}>
      <div className={s.lockedBody} aria-hidden>
        <div className={s.lockedBar} style={{ width: "70%" }} />
        <div className={s.lockedBar} style={{ width: "45%" }} />
        <div className={s.lockedBar} style={{ width: "85%" }} />
      </div>
      <span className={s.lockedOverlay}>
        <strong>{business ? "Otra ayuda encaja con tu empresa" : "Otra convocatoria encaja contigo"}</strong>
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
  const [polls, setPolls] = useState(0);

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
    setPolls(0);
    load();
  }, [load]);

  // While Mecena searches BDNS for this profile in the background, reload now and then to show what it adds.
  const searching = data?.liveSearch?.searching ?? false;
  useEffect(() => {
    if (!searching || polls >= 12) return;
    const t = setTimeout(() => {
      setPolls((n) => n + 1);
      load();
    }, 15_000);
    return () => clearTimeout(t);
  }, [searching, polls, load]);

  if (error)
    return (
      <p className={s.empty}>
        {error}{" "}
        <Button variant="quiet" onClick={load}>
          Reintentar
        </Button>
      </p>
    );
  const business = (data?.mode ?? profile?.kind) === "business";
  if (!data) return <Spinner label={business ? "Buscando ayudas para tu empresa…" : "Buscando convocatorias para ti…"} />;

  const total = data.results.length + data.lockedCount;
  return (
    <>
      <p className={s.modeLine}>
        <span>{data.mode === "creator" ? "Para artistas y creadores" : "Para pymes y autónomos"}</span>
        <span>
          {total} {total === 1 ? "encaja" : "encajan"} contigo
        </span>
      </p>
      {searching && <p className={s.liveLine}>Buscando en la BDNS convocatorias públicas para tu perfil…</p>}
      {total === 0 && (
        <p className={s.empty}>
          {business ? (
            <>
              Aún no encontramos ayudas para tu empresa. <Link href={ROUTES.onboarding}>Cuéntanos más</Link>: a qué os dedicáis, dónde estáis y qué queréis financiar.
            </>
          ) : (
            <>
              Aún no encontramos convocatorias para tu perfil. Cuéntanos más sobre ti en el <Link href={ROUTES.onboarding}>alta</Link>.
            </>
          )}
        </p>
      )}
      {data.results.map((r) => (
        <CallCard key={r.call.id} {...r} />
      ))}
      {Array.from({ length: data.lockedCount }, (_, i) => (
        <LockedCard key={i} business={business} onOpen={() => setPaywall(true)} />
      ))}
      {profile && <DeepResearchPanel profileId={profile.id} pro={Boolean(data.pro)} onNeedPro={() => setPaywall(true)} />}
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
