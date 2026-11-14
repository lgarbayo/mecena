"use client";
// WP-06 feed: ranked matches for the active profile; the free plan sees 3, the rest are blurred behind the paywall.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API, ROUTES } from "@/contracts";
import type { CallsDiagnostics, CallsResponse } from "@/contracts/api";
import { useApp } from "@/components/shell/AppProvider";
import { Button, Spinner } from "@/components/ui";
import { Paywall } from "@/features/purchases/ui/Paywall";
import { DeepResearchPanel } from "@/features/deep-research/ui/DeepResearchPanel";
import { apiGet } from "@/lib/api-client";
import { SCORE_MAX, daysLeft, fitLabel } from "../labels";
import s from "./calls.module.css";
import { FIT_COPY, deadlineLabel, isUrgent } from "./format";

type Result = CallsResponse["results"][number];
type QuickFilter = "all" | "high" | "local";

/** Score parts shown on each card, in the order the engine adds them. */
const BREAKDOWN_PARTS = [
  ["base", "Requisitos"],
  ["affinity", "Afinidad"],
  ["documents", "Documentos"],
  ["amount", "Cuantía"],
  ["timing", "Plazo y zona"],
] as const satisfies readonly (readonly [keyof typeof SCORE_MAX, string])[];

const LEGAL_LABELS: Record<string, string> = {
  autonomo: "Autónomo/a",
  sl: "S.L.",
  sa: "S.A.",
  cooperativa: "Cooperativa",
  asociacion: "Asociación",
  otra: "Otra forma",
};

export function CallCard({ call, match, breakdown }: Result) {
  const label = fitLabel(match.score);
  const days = daysLeft(call);
  return (
    <Link href={ROUTES.call(call.id)} className={s.card} data-testid="call-card">
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
      {breakdown && (
        <div className={s.pillBreakdown} aria-label="Desglose de puntuación" data-testid="card-breakdown">
          {BREAKDOWN_PARTS.map(([key, name]) => (
            <span key={key} className={s.scorePill}>
              <span>{name}</span>
              <b>
                {Math.round(breakdown[key])}/{SCORE_MAX[key]}
              </b>
            </span>
          ))}
        </div>
      )}
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
    <button
      type="button"
      className={s.locked}
      onClick={onOpen}
      data-testid="locked-banner"
      aria-label={business ? "Ver más ayudas con Mecena Pro" : "Ver más convocatorias con Mecena Pro"}
    >
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
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const isInitialMount = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedQuery(searchInput.trim());
    }, 220);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (qText = appliedQuery) => {
      if (!profile) return;
      setError(null);
      try {
        const q = new URLSearchParams({
          profileId: profile.id,
          ...(appUserId ? { appUserId } : {}),
          ...(qText ? { q: qText } : {}),
        });
        setData(await apiGet<CallsResponse>(`${API.calls}?${q}`));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron cargar las convocatorias");
      }
    },
    [profile, appUserId, appliedQuery],
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      setData(null);
    }
    setPolls(0);
    void load(appliedQuery);
  }, [load, appliedQuery]);

  // While Mecena searches BDNS for this profile in the background, reload now and then to show what it adds.
  const searching = data?.liveSearch?.searching ?? false;
  useEffect(() => {
    if (!searching || polls >= 12) return;
    const t = setTimeout(() => {
      setPolls((n) => n + 1);
      void load(appliedQuery);
    }, 15_000);
    return () => clearTimeout(t);
  }, [searching, polls, load, appliedQuery]);

  // Real funnel from the engine (never invented on the client).
  const diagnostics: CallsDiagnostics | null = data?.diagnostics ?? null;

  const filteredResults = useMemo(() => {
    if (!data) return [];
    return data.results.filter(({ call, match }) => {
      if (quickFilter === "high") return match.score >= 75;
      if (quickFilter === "local") {
        const loc = (diagnostics?.profileSummary.location ?? "").toLowerCase();
        const inWhy = match.whyYouFit.some((w) => /de tu zona|tu comunidad|tu provincia|tu municipio/i.test(w));
        const inRegion = Boolean(loc && call.region && loc.includes(call.region.toLowerCase()));
        return inWhy || inRegion;
      }
      return true;
    });
  }, [data, quickFilter, diagnostics]);

  if (error)
    return (
      <p className={s.empty}>
        {error}{" "}
        <Button variant="quiet" onClick={() => load(appliedQuery)}>
          Reintentar
        </Button>
      </p>
    );
  const business = (data?.mode ?? profile?.kind) === "business";
  if (!data || !diagnostics) return <Spinner label={business ? "Buscando ayudas para tu empresa…" : "Buscando convocatorias para ti…"} />;

  const total = data.results.length + data.lockedCount;
  const { profileSummary } = diagnostics;
  const discardedTotal = diagnostics.discardedByEligibility + diagnostics.discardedByDiscipline;
  const profileChips: string[] = [
    ...(profileSummary.kind === "business" && profileSummary.sector ? [profileSummary.sector] : profileSummary.disciplines),
    ...(profileSummary.location ? [profileSummary.location] : []),
    ...(profileSummary.legalForm ? [LEGAL_LABELS[profileSummary.legalForm] ?? profileSummary.legalForm] : []),
    ...profileSummary.fundingNeeds.slice(0, 2),
  ];
  const dynamicFilterChips: string[] = [
    ...(profileSummary.kind === "business" && profileSummary.sector ? [profileSummary.sector] : profileSummary.disciplines.slice(0, 2)),
    ...profileSummary.fundingNeeds.slice(0, 1),
  ].filter(Boolean);

  const toggleKeywordChip = (chip: string) => {
    if (searchInput.trim().toLowerCase() === chip.toLowerCase()) {
      setSearchInput("");
      setAppliedQuery("");
    } else {
      setSearchInput(chip);
      setAppliedQuery(chip);
    }
  };

  return (
    <>
      <p className={s.modeLine}>
        <span>{data.mode === "creator" ? "Para artistas y creadores" : "Para pymes y autónomos"}</span>
        <span>
          {total} {total === 1 ? "encaja" : "encajan"} contigo
        </span>
      </p>

      <section className={s.fitPanel} aria-label="Panel de encaje con tu perfil" data-testid="matching-pipeline">
        <div className={s.pipelineGrid}>
          <div className={s.pipelineStep}>
            <span className={s.stepBadge}>1 · Perfil detectado</span>
            <strong className={s.stepTitle}>{profileSummary.displayName || (business ? "Tu empresa" : "Tu perfil creativo")}</strong>
            {profileChips.length > 0 ? (
              <div className={s.profileChips}>
                {profileChips.map((chip) => (
                  <span key={chip} className={s.profileChip}>
                    {chip}
                  </span>
                ))}
              </div>
            ) : (
              <span className={s.stepSub}>Sin etiquetas específicas todavía</span>
            )}
          </div>

          <div className={s.pipelineStep}>
            <span className={s.stepBadge}>2 · Cribado de bases y territorio</span>
            <strong className={s.stepTitle}>{diagnostics.totalEvaluated} analizadas</strong>
            <span className={s.stepSub}>{discardedTotal} descartadas por requisitos o disciplina</span>
          </div>

          <div className={s.pipelineStep}>
            <span className={s.stepBadge}>3 · Ranking de afinidad</span>
            <strong className={s.stepTitle}>{diagnostics.matchedCount} convocatorias ordenadas para ti</strong>
            <span className={s.stepSub}>Puntuadas de 0 a 100 según tu perfil</span>
          </div>
        </div>

        {!profileSummary.isComplete && (
          <div className={s.incompleteAlert} role="region" aria-label="Perfil incompleto" data-testid="incomplete-profile-banner">
            <p className={s.incompleteText}>
              Tu perfil aún no tiene disciplina, ubicación ni proyecto definidos. Estamos mostrando convocatorias generales abiertas. Completa las 5 preguntas para filtrar y puntuar las que realmente encajan contigo.
            </p>
            <Link href={ROUTES.onboarding} className={s.incompleteCta}>
              Personalizar mi perfil ahora →
            </Link>
          </div>
        )}

        <div className={s.filterControls}>
          <div className={s.searchRow}>
            <input
              type="search"
              className={s.searchInput}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filtrar por disciplina, ciudad, beca, residencia, premio…"
              aria-label="Filtrar por disciplina, ciudad, beca, residencia, premio"
              data-testid="calls-search"
            />
            <Link href={ROUTES.onboarding} className={s.editProfileLink}>
              Editar respuestas del perfil
            </Link>
          </div>

          <div className={s.quickPills} role="group" aria-label="Filtros rápidos">
            <button
              type="button"
              className={`${s.quickPill} ${quickFilter === "all" && !appliedQuery ? s.quickPillActive : ""}`}
              onClick={() => {
                setQuickFilter("all");
                setSearchInput("");
                setAppliedQuery("");
              }}
            >
              Todas
            </button>
            <button
              type="button"
              className={`${s.quickPill} ${quickFilter === "high" ? s.quickPillActive : ""}`}
              onClick={() => setQuickFilter((f) => (f === "high" ? "all" : "high"))}
            >
              Mayor afinidad (≥75%)
            </button>
            <button
              type="button"
              className={`${s.quickPill} ${quickFilter === "local" ? s.quickPillActive : ""}`}
              onClick={() => setQuickFilter((f) => (f === "local" ? "all" : "local"))}
            >
              De tu zona
            </button>
            {dynamicFilterChips.map((chip) => {
              const active = appliedQuery.toLowerCase() === chip.toLowerCase();
              return (
                <button
                  key={chip}
                  type="button"
                  className={`${s.quickPill} ${active ? s.quickPillActive : ""}`}
                  onClick={() => toggleKeywordChip(chip)}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {searching && <p className={s.liveLine}>Buscando en la BDNS convocatorias públicas para tu perfil…</p>}
      {filteredResults.length === 0 && data.lockedCount === 0 && (
        <p className={s.empty}>
          {appliedQuery || quickFilter !== "all" ? (
            <>
              No hay convocatorias que coincidan con este filtro.{" "}
              <button
                type="button"
                className={s.resetFilterBtn}
                onClick={() => {
                  setQuickFilter("all");
                  setSearchInput("");
                  setAppliedQuery("");
                }}
              >
                Ver todas las que encajan contigo
              </button>
            </>
          ) : business ? (
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
      {filteredResults.map((r) => (
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
          void load(appliedQuery);
        }}
      />
    </>
  );
}
