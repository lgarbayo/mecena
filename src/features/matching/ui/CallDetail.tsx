"use client";
// WP-06 call detail: bases in plain Spanish, the visible score breakdown, checklist, criteria and the CTA.
import Link from "next/link";
import { useEffect, useState } from "react";
import { API, ROUTES, type Call, type MatchResult, type PastAward } from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";
import { Card, PageTitle, Spinner, Tag } from "@/components/ui";
import { apiGet } from "@/lib/api-client";
import { daysLeft, fitLabel, SCORE_MAX } from "../labels";
import type { CallHistory } from "@/features/history/history";
import type { ScoreBreakdown } from "../rules";
import s from "./calls.module.css";
import { FIT_COPY, deadlineLabel, formatDate, isUrgent } from "./format";

interface Detail {
  call: Call;
  match: MatchResult;
  checklist: string[];
  checklistItems: { item: string; done: boolean }[];
  breakdown: ScoreBreakdown;
  similarAwards: PastAward[];
  history: CallHistory | null;
  winnerShare: { compatible: number; total: number; share: number } | null;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const pts = (x: number) => x.toLocaleString("es-ES");

const PARTS: { key: keyof ScoreBreakdown; label: string; max: number }[] = [
  { key: "base", label: "Cumples los requisitos", max: SCORE_MAX.base },
  { key: "affinity", label: "Afinidad con tu obra o actividad", max: SCORE_MAX.affinity },
  { key: "documents", label: "Documentos que ya tienes", max: SCORE_MAX.documents },
  { key: "amount", label: "Importe", max: SCORE_MAX.amount },
  { key: "timing", label: "Plazo y cercanía", max: SCORE_MAX.timing },
];

export function CallDetail({ id }: { id: string }) {
  const { profile } = useApp();
  const business = profile?.kind === "business";
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setD(null);
    apiGet<Detail>(`${API.call(id)}?profileId=${encodeURIComponent(profile.id)}`)
      .then(setD)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la convocatoria"));
  }, [id, profile]);

  if (error) return <p className={s.empty}>{error}</p>;
  if (!d) return <Spinner />;

  const { call, match, breakdown } = d;
  const days = daysLeft(call);
  const label = fitLabel(match.score);
  const totalPoints = call.criteria.reduce((sum, c) => sum + c.maxPoints, 0);

  return (
    <>
      <div className={s.hero}>
        <PageTitle kicker={call.organizer}>{call.title}</PageTitle>
      </div>
      <p className={s.summary}>{match.plainSummary || call.summary}</p>

      <dl className={s.kv}>
        <dt>Importe</dt>
        <dd>
          <strong>{call.amountText}</strong>
        </dd>
        <dt>Plazo</dt>
        <dd className={isUrgent(days) ? s.urgent : undefined}>
          {deadlineLabel(call, days)}
          {call.deadline && call.status === "open" ? ` · ${formatDate(call.deadline)}` : ""}
        </dd>
        <dt>Bases</dt>
        <dd>
          <a href={call.basesUrl ?? call.sourceUrl} target="_blank" rel="noreferrer">
            Ver las bases oficiales
          </a>
        </dd>
      </dl>

      <Card>
        <div className={s.top}>
          <h2 className={s.title}>Tu encaje</h2>
          <span className={`${s.fitTag} ${s[`fit-${label}`]}`}>
            <b>{match.score}</b>
            {label}
          </span>
        </div>
        <div className={s.breakdown}>
          {PARTS.map((p) => (
            <div key={p.key} className={s.bar}>
              <span>{p.label}</span>
              <span>
                {breakdown[p.key]}/{p.max}
              </span>
              <span className={s.barTrack}>
                <span className={s.barFill} style={{ display: "block", width: `${(100 * breakdown[p.key]) / p.max}%` }} />
              </span>
            </div>
          ))}
        </div>
        <p className={s.note}>{FIT_COPY[label]}: es una orientación sobre cuánto encaja tu perfil, no una probabilidad de ganar.</p>
        {match.whyYouFit.length > 0 && (
          <>
            <p className={s.sectionLabel}>Por qué encajas</p>
            <ul className={`${s.list} ${s.fit}`}>
              {match.whyYouFit.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </>
        )}
        {match.whatYouMiss.length > 0 && (
          <>
            <p className={s.sectionLabel}>Qué te falta</p>
            <ul className={`${s.list} ${s.miss}`}>
              {match.whatYouMiss.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card>
        <h2 className={s.title}>Qué tienes que presentar</h2>
        <ul className={s.checklist}>
          {d.checklistItems.map(({ item, done }) => (
            <li key={item}>
              <span className={`${s.box} ${done ? s.boxDone : ""}`} aria-label={done ? "Ya lo tienes" : "Pendiente"}>
                {done ? "✓" : ""}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {call.dossierRequirements && (
          <p className={s.note}>
            Dossier:{" "}
            {[
              call.dossierRequirements.maxImages && `máx. ${call.dossierRequirements.maxImages} imágenes`,
              call.dossierRequirements.maxFileMb && `máx. ${call.dossierRequirements.maxFileMb} MB`,
              call.dossierRequirements.format,
              call.dossierRequirements.notes,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </Card>

      {call.criteria.length > 0 && (
        <Card>
          <h2 className={s.title}>Cómo puntúa el jurado</h2>
          <ul className={s.criteria}>
            {call.criteria.map((c) => (
              <li key={c.id}>
                <span>{c.name}</span>
                <strong>{totalPoints ? Math.round((100 * c.maxPoints) / totalPoints) : c.maxPoints}%</strong>
              </li>
            ))}
          </ul>
          {call.criteriaSource === "estimated" && <p className={s.note}>Las bases no publican puntuaciones: el peso es orientativo.</p>}
        </Card>
      )}

      {d.history && d.history.editionsFound > 0 && (
        <Card>
          <h2 className={s.title}>Historial de esta convocatoria</h2>
          <ul className={s.criteria}>
            {d.history.successRate && (
              <li>
                <span>
                  Solicitudes concedidas ({d.history.successRate.awarded} de {d.history.successRate.applicants})
                </span>
                <strong>{pct(d.history.successRate.rate)}</strong>
              </li>
            )}
            {d.history.cutoff && (
              <li>
                <span>Nota del último concedido</span>
                <strong>
                  {pts(d.history.cutoff.score)}
                  {d.history.cutoff.maxScore ? `/${d.history.cutoff.maxScore}` : ""}
                </strong>
              </li>
            )}
            {d.winnerShare && (
              <li>
                <span>Premiados de tu mismo tipo</span>
                <strong>{pct(d.winnerShare.share)}</strong>
              </li>
            )}
            <li>
              <span>Ediciones anteriores</span>
              <strong>{d.history.editionsFound}</strong>
            </li>
          </ul>
          <p className={s.note}>
            {d.history.evidence} Orientativo, no es una probabilidad.
            {d.history.cutoff && (
              <>
                {" "}
                <a href={d.history.cutoff.sourceUrl} target="_blank" rel="noreferrer">
                  Ver la resolución
                </a>
              </>
            )}
          </p>
        </Card>
      )}

      {d.similarAwards.length > 0 && (
        <Card>
          <h2 className={s.title}>Ganadores parecidos a ti</h2>
          <ul className={s.criteria}>
            {d.similarAwards.map((a) => (
              <li key={a.id}>
                <span>
                  {a.beneficiary} · {a.year}
                  {a.projectTitle ? ` · ${a.projectTitle}` : ""}
                </span>
                {a.amountEur !== undefined && <strong>{a.amountEur.toLocaleString("es-ES")} €</strong>}
              </li>
            ))}
          </ul>
          <p className={s.note}>Orientativo, no es una probabilidad.</p>
        </Card>
      )}

      {call.status === "recurring" && (
        <p>
          <Tag tone="warn">Edición 2026 cerrada</Tag> {business ? "Puedes dejar preparada la solicitud para la próxima." : "Puedes preparar el dossier y la memoria para la próxima."}
        </p>
      )}

      <div className={s.actions}>
        <Link href={ROUTES.application(call.id)} className="btn btn-primary">
          Prepárame la solicitud
        </Link>
        {!business && (
          <Link href={`${ROUTES.dossier}?callId=${encodeURIComponent(call.id)}`} className="btn btn-ghost">
            Dossier para esta convocatoria
          </Link>
        )}
      </div>
    </>
  );
}
