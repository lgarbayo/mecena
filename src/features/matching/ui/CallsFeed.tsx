"use client";
// WP-06 feed: ranked matches for the active profile; the free plan sees 3, the rest only their score, blurred behind the paywall.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API, ROUTES } from "@/contracts";
import type { CallsDiagnostics, CallsResponse } from "@/contracts/api";
import { useApp } from "@/components/shell/AppProvider";
import { Button, LoadingRegion } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { Paywall } from "@/features/purchases/ui/Paywall";
import { DeadlineAlert } from "@/features/purchases/ui/DeadlineAlert";
import { DeepResearchPanel } from "@/features/deep-research/ui/DeepResearchPanel";
import { apiGet } from "@/lib/api-client";
import { SCORE_MAX, daysLeft, fitLabel } from "../labels";
import s from "./calls.module.css";
import { CallCardSkeleton, CallsFeedSkeleton } from "./skeletons";
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
        {call.status === "recurring" ? (
          <span className={`${s.fitTag} ${s["fit-bajo"]}`}>Edición cerrada</span>
        ) : (
          <span className={`${s.fitTag} ${s[`fit-${label}`]}`} aria-label={`${FIT_COPY[label]}: ${match.score} de 100`}>
            <b>{match.score}</b>
            {label}
          </span>
        )}
      </div>
      <div className={s.facts}>
        <span>
          <strong>{call.amountText}</strong>
        </span>
        <span className={isUrgent(days) ? s.urgent : undefined}>{deadlineLabel(call, days)}</span>
      </div>
      {breakdown && (
        <ul className={s.miniBreakdown} aria-label="Desglose de puntuación" data-testid="card-breakdown">
          {BREAKDOWN_PARTS.map(([key, name]) => {
            const value = Math.round(breakdown[key]);
            return (
              <li key={key} style={{ flexGrow: SCORE_MAX[key] }} title={`${name}: ${value}/${SCORE_MAX[key]}`}>
                <span className={s.miniFill} style={{ width: `${Math.min(100, (value / SCORE_MAX[key]) * 100)}%` }} />
                <span className={s.srOnly}>
                  {name}: {value}/{SCORE_MAX[key]}
                </span>
              </li>
            );
          })}
        </ul>
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

/** A match beyond the free quota: its score is visible, the call itself stays blurred behind the paywall. */
function LockedCard({ onOpen, business, score }: { onOpen(): void; business?: boolean; score?: number }) {
  const label = score === undefined ? null : fitLabel(score);
  const what = business ? "ayuda" : "convocatoria";
  return (
    <button
      type="button"
      className={s.locked}
      onClick={onOpen}
      data-testid="locked-banner"
      aria-label={`${label ? `Otra ${what} con encaje ${label} (${score} de 100). ` : ""}Ver más ${business ? "ayudas" : "convocatorias"} con Mecena Pro`}
    >
      <div className={s.top} aria-hidden>
        <div className={s.lockedTitle}>
          <div className={s.lockedBar} style={{ width: "80%" }} />
          <div className={s.lockedBar} style={{ width: "50%" }} />
        </div>
        {label && (
          <span className={`${s.fitTag} ${s[`fit-${label}`]}`} data-testid="locked-score">
            <b>{score}</b>
            {label}
          </span>
        )}
      </div>
      <div className={s.lockedContent}>
        <div className={s.lockedBody} aria-hidden>
          <div className={s.lockedBar} style={{ width: "70%" }} />
          <div className={s.lockedBar} style={{ width: "45%" }} />
          <div className={s.lockedBar} style={{ width: "85%" }} />
        </div>
        <span className={s.lockedOverlay}>
          <strong>{business ? "Otra ayuda encaja con tu empresa" : "Otra convocatoria encaja contigo"}</strong>
          <span>Desbloquéala con Mecena Pro</span>
        </span>
      </div>
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
      if (quickFilter === "high") return fitLabel(match.score) === "alto";
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
  if (!data || !diagnostics) return <CallsFeedSkeleton label={business ? "Buscando ayudas para tu empresa…" : "Buscando convocatorias para ti…"} />;

  const total = data.results.length + data.lockedCount;
  // Locked cards carry their score, so "Encaje alto" filters them too (by score only: nothing else of the call is known).
  const lockedScores: (number | undefined)[] = Array.from({ length: data.lockedCount }, (_, i) => data.lockedScores?.[i]);
  const shownLocked = quickFilter === "high" ? lockedScores.filter((n) => n !== undefined && fitLabel(n) === "alto") : lockedScores;
  const { profileSummary } = diagnostics;
  const discardedTotal = diagnostics.discardedByEligibility + diagnostics.discardedByDiscipline;
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

      <section className={s.fitPanel} aria-label="Cómo hemos elegido tus convocatorias" data-testid="matching-pipeline">
        <dl className={s.funnel}>
          <div>
            <dt>Analizadas</dt>
            <dd>{diagnostics.totalEvaluated}</dd>
          </div>
          <div>
            <dt>Descartadas</dt>
            <dd>{discardedTotal}</dd>
          </div>
          <div className={s.funnelHit}>
            <dt>Encajan</dt>
            <dd>{diagnostics.matchedCount}</dd>
          </div>
        </dl>

        {!profileSummary.isComplete && (
          <div className={s.incompleteAlert} role="region" aria-label="Perfil incompleto" data-testid="incomplete-profile-banner">
            <p>{business ? "Faltan datos de tu empresa: te enseñamos ayudas generales." : "Tu perfil está a medias: te enseñamos convocatorias generales."}</p>
            <Link href={ROUTES.onboarding} className={s.incompleteCta}>
              Completar perfil <Icon name="arrow-right" size={16} />
            </Link>
          </div>
        )}

        <div className={s.searchRow}>
          <Icon name="search" size={18} className={s.searchIcon} />
          <input
            type="search"
            className={s.searchInput}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={business ? "Sector, ciudad, tipo de ayuda…" : "Disciplina, ciudad, beca, premio…"}
            aria-label={business ? "Filtrar por sector, ciudad o tipo de ayuda" : "Filtrar por disciplina, ciudad, beca, residencia, premio"}
            data-testid="calls-search"
          />
        </div>

        <div className={s.quickPills} role="group" aria-label="Filtros rápidos">
          <button
            type="button"
            className={`${s.quickPill} ${quickFilter === "all" && !appliedQuery ? s.quickPillActive : ""}`}
            aria-pressed={quickFilter === "all" && !appliedQuery}
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
            aria-pressed={quickFilter === "high"}
            onClick={() => setQuickFilter((f) => (f === "high" ? "all" : "high"))}
          >
            Encaje alto
          </button>
          <button
            type="button"
            className={`${s.quickPill} ${quickFilter === "local" ? s.quickPillActive : ""}`}
            aria-pressed={quickFilter === "local"}
            onClick={() => setQuickFilter((f) => (f === "local" ? "all" : "local"))}
          >
            De tu zona
          </button>
          {dynamicFilterChips.map((chip) => {
            const active = appliedQuery.toLowerCase() === chip.toLowerCase();
            return (
              <button key={chip} type="button" className={`${s.quickPill} ${active ? s.quickPillActive : ""}`} aria-pressed={active} onClick={() => toggleKeywordChip(chip)}>
                {chip}
              </button>
            );
          })}
        </div>
        <Link href={ROUTES.onboarding} className={s.editProfileLink}>
          Editar mi perfil
        </Link>
      </section>

      <DeadlineAlert pro={Boolean(data.pro)} results={data.results} />
      {searching && <p className={s.liveLine}>Buscando en la BDNS convocatorias públicas para tu perfil…</p>}
      {filteredResults.length === 0 && shownLocked.length === 0 && (
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
      {searching && (
        <LoadingRegion label="Buscando más convocatorias en la BDNS…">
          <CallCardSkeleton />
        </LoadingRegion>
      )}
      {shownLocked.map((score, i) => (
        <LockedCard key={i} score={score} business={business} onOpen={() => setPaywall(true)} />
      ))}
      {data.editions && data.editions.length > 0 && (
        <section className={s.editions} aria-labelledby="editions-title" data-testid="editions">
          <h2 id="editions-title" className={s.sectionHeading}>
            Próximas ediciones
          </h2>
          <p className={s.sectionLead}>Ya cerraron este año. Te avisamos cuando abra la siguiente.</p>
          {data.editions.map((r) => (
            <CallCard key={r.call.id} {...r} />
          ))}
        </section>
      )}
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
