"use client";
// Pro "Busca más para mí": a background web search for private calls (foundations, galleries, festivals) that BDNS
// does not list. Results are kept apart from the feed and labelled as unverified.
import { useCallback, useEffect, useState } from "react";
import { API } from "@/contracts";
import type { DeepResearchResponse } from "@/contracts/api";
import { Button } from "@/components/ui";
import { daysLeft, fitLabel } from "@/features/matching/labels";
import { FIT_COPY, deadlineLabel, isUrgent } from "@/features/matching/ui/format";
import { ApiClientError, apiGet, apiSend } from "@/lib/api-client";
import s from "./research.module.css";

type Result = DeepResearchResponse["results"][number];

function WebCallCard({ call, match }: Result) {
  const label = fitLabel(match.score);
  const days = daysLeft(call);
  return (
    <a href={call.sourceUrl} target="_blank" rel="noopener noreferrer" className={s.card}>
      <p className={s.warning}>Sin verificar: revisa las bases</p>
      <div className={s.top}>
        <div>
          <h3 className={s.title}>{call.title}</h3>
          <p className={s.organizer}>
            {call.organizer} · {new URL(call.sourceUrl).hostname.replace(/^www\./, "")}
          </p>
        </div>
        <span className={s.fit} aria-label={`${FIT_COPY[label]}: ${match.score} de 100`}>
          <b>{match.score}</b> {label}
        </span>
      </div>
      <p className={s.facts}>
        <strong>{call.amountText}</strong> · <span className={isUrgent(days) ? s.urgent : undefined}>{deadlineLabel(call, days)}</span>
      </p>
      {call.summary && <p className={s.summary}>{call.summary}</p>}
    </a>
  );
}

export function DeepResearchPanel({ profileId, pro, onNeedPro }: { profileId: string; pro: boolean; onNeedPro(): void }) {
  const [data, setData] = useState<DeepResearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // one per poll, so a failed poll still schedules the next one

  const load = useCallback(async () => {
    if (!pro) return;
    try {
      const q = new URLSearchParams({ profileId });
      setData(await apiGet<DeepResearchResponse>(`${API.callsResearch}?${q}`));
      setError(null);
    } catch (e) {
      if (!(e instanceof ApiClientError && e.paymentRequired)) setError(e instanceof Error ? e.message : "No se pudo cargar la búsqueda ampliada");
    }
  }, [profileId, pro]);

  useEffect(() => {
    setData(null);
    setTick(0);
    load();
  }, [load]);

  // A run takes a minute or two: poll while it is running (at most ~10 minutes; the server marks stale runs).
  const running = data?.status === "running";
  useEffect(() => {
    if (!running || tick >= 120) return;
    const t = setTimeout(() => {
      setTick((n) => n + 1);
      load();
    }, 5000);
    return () => clearTimeout(t);
  }, [running, tick, load]);

  async function start() {
    if (!pro) return onNeedPro();
    setBusy(true);
    setError(null);
    try {
      setData(await apiSend<DeepResearchResponse>(API.callsResearch, { profileId }));
    } catch (e) {
      if (e instanceof ApiClientError && e.paymentRequired) onNeedPro();
      else setError(e instanceof Error ? e.message : "No se pudo lanzar la búsqueda");
    } finally {
      setBusy(false);
    }
  }

  const done = data?.status === "done" || (data?.status === "limited" && data.finishedAt);
  const fresh = data?.status === "done" && data.freshUntil && Date.parse(data.freshUntil) > Date.now();
  return (
    <section className={s.panel} aria-labelledby="deep-research-title">
      <h2 id="deep-research-title" className={s.heading}>
        Más allá de las ayudas públicas
      </h2>
      <p className={s.lead}>Premios, becas y certámenes privados (fundaciones, galerías, festivales) que buscamos en la web para ti.</p>
      {running ? (
        <p className={s.status} role="status">
          Buscando en la web para ti… puede tardar un par de minutos.
        </p>
      ) : (
        <Button onClick={start} disabled={busy}>
          {busy ? "Lanzando…" : done ? (fresh ? "Buscar de nuevo" : "Volver a buscar") : "Busca más para mí"}
          {!pro && " · Pro"}
        </Button>
      )}
      {data?.message && <p className={s.status}>{data.message}</p>}
      {error && <p className={s.status}>{error}</p>}
      {done && data.results.length === 0 && <p className={s.status}>No hemos encontrado convocatorias privadas abiertas que encajen contigo. Prueba otra vez más adelante.</p>}
      {data?.results.map((r) => (
        <WebCallCard key={r.call.id} {...r} />
      ))}
      {data && data.discarded > 0 && done && (
        <p className={s.note}>
          Hemos descartado {data.discarded} {data.discarded === 1 ? "resultado" : "resultados"} sin fuente, ya cerrados o que no encajan.
        </p>
      )}
    </section>
  );
}
