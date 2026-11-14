"use client";
// WP-08 /tribunal/[applicationId]: 3 judges on the call's criteria, fixes to accept (with an optional fact each),
// "Aplicar mejoras" in two visible phases (revise, then the judges re-read one by one), diff and "Deshacer mejoras".
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { API, ROUTES, type Application, type JuryScore } from "@/contracts";
import { Button, Card, LoadingRegion, PageTitle, Tag } from "@/components/ui";
import { ApiClientError, apiGet, apiSend } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { Paywall } from "@/features/purchases/ui/Paywall";
import { changes, errorText, scoreWithProgress } from "./client";
import s from "./jury.module.css";
import { JuryScoreSkeleton } from "./JurySkeleton";

/** Animated count-up between two totals (instant when the user prefers reduced motion). */
function useCountUp(target: number, from: number) {
  const [n, setN] = useState(from);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 1200;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      setN(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, from]);
  return n;
}

/** What the score change says: signed, and honest when it did not go up. */
export function deltaText(d: number): string {
  if (d > 0) return `+${d} puntos tras las mejoras`;
  if (d === 0) return "Misma nota: completa los huecos marcados";
  return `${d} puntos: completa los huecos marcados o deshaz las mejoras`;
}

/** Placeholder for the optional fact of a fix: what kind of data it asks for. */
function factHint(fix: string): string {
  const f = fix.toLowerCase();
  if (/fecha|calendario|fases|plazo/.test(f)) return "Tus fechas (opcional): p. ej. de marzo a junio de 2027";
  if (/cuantifica|cifra|cu[aá]nt|ventas|empleo|p[uú]blico/.test(f)) return "Tu cifra (opcional): p. ej. 300 visitantes";
  if (/logros|trayectoria|exposici|premio/.test(f)) return "Tus datos (opcional): p. ej. Premio X, Lugo, 2023";
  return "Si falta un dato (fecha, cifra, nombre), escríbelo aquí (opcional)";
}

const isEstimated = (score: JuryScore) => score.estimated ?? /estimad/i.test(score.disclaimer);

type Phase = "loading" | "scoring" | "revising" | "rescoring" | "undoing" | null;
type JudgeProgress = { judgeId: string; name: string; total?: number };
type ImproveBody = { applicationId: string; scoreId: string; fixes: string[]; facts: { fix: string; text: string }[]; stage: "revise" };

export function JuryPage({ applicationId }: { applicationId: string }) {
  const [score, setScore] = useState<JuryScore | null>(null);
  const [app, setApp] = useState<Application | null>(null);
  const [previous, setPrevious] = useState<{ score: JuryScore; app: Application } | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [facts, setFacts] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("loading");
  const [judges, setJudges] = useState<JudgeProgress[]>([]);
  const [error, setError] = useState<{ text: string; retry: () => void } | null>(null);
  // 402: the runs included with a Solicitud premium are used up (the jury is Pro)
  const [paywall, setPaywall] = useState(false);
  const started = useRef(false);

  const show = useCallback((sc: JuryScore, a: Application) => {
    setScore(sc);
    setApp(a);
    setAccepted(new Set(sc.criteria.flatMap((c) => c.fixes)));
    setFacts({});
  }, []);

  // Every mutation carries an Idempotency-Key: a retry after a failure reuses it (same body), so the server never
  // scores, revises or undoes twice for one tap.
  // useAction.run resolves to undefined both when it ignores a duplicate tap and when the call failed; `failure`
  // keeps the failed call's error so the handlers below can show its Spanish text instead of swallowing it.
  const failure = useRef<unknown>(null);
  const settled = useCallback(async <R,>(call: () => Promise<R | undefined>): Promise<R | undefined> => {
    failure.current = null;
    const r = await call();
    if (r === undefined && failure.current) throw failure.current;
    return r;
  }, []);
  const remember = <A extends unknown[], R>(fn: (key: string, ...a: A) => Promise<R>) =>
    async (key: string, ...a: A): Promise<R> => {
      try {
        return await fn(key, ...a);
      } catch (e) {
        failure.current = e;
        throw e;
      }
    };
  const scorer = useAction(remember((idempotencyKey: string, id: string) =>
    scoreWithProgress(
      { applicationId: id },
      (e) => setJudges((js) => (js.some((j) => j.judgeId === e.judgeId) ? js.map((j) => (j.judgeId === e.judgeId ? { ...j, total: e.total } : j)) : [...js, e])),
      idempotencyKey,
    ),
  ));
  const reviser = useAction(remember((idempotencyKey: string, b: ImproveBody) =>
    apiSend<{ application: Application }>(API.juryImprove, b, "POST", undefined, { idempotencyKey }),
  ));
  const undoer = useAction(remember((idempotencyKey: string, id: string) =>
    apiSend<{ application: Application; score: JuryScore | null }>(API.juryUndo, { applicationId: id }, "POST", undefined, { idempotencyKey }),
  ));
  const runScore = scorer.run;

  /** Score the current version with per-judge progress (reuses a score in flight or already saved). */
  const rescore = useCallback(
    async (next: Phase, judgesOf: JuryScore["judges"] = []) => {
      setPhase(next);
      setJudges(judgesOf.map((j) => ({ judgeId: j.id, name: j.name })));
      const r = await settled(() => runScore(applicationId));
      if (!r) throw new ApiClientError(409, "conflict", "El tribunal ya está puntuando esta solicitud.");
      return r;
    },
    [applicationId, runScore, settled],
  );

  const run = useCallback(async () => {
    setError(null);
    setPhase("loading");
    try {
      const latest = await apiGet<{ score: JuryScore | null; application: Application }>(`${API.jury}?applicationId=${encodeURIComponent(applicationId)}`);
      if (latest.score && latest.score.applicationVersion === latest.application.version) show(latest.score, latest.application);
      else {
        const r = await rescore("scoring", latest.score?.judges);
        show(r.score, r.application);
      }
    } catch (e) {
      if (e instanceof ApiClientError && e.paymentRequired) setPaywall(true);
      setError({ text: errorText(e, "El tribunal no ha podido puntuar ahora mismo. Inténtalo de nuevo."), retry: run });
    } finally {
      setPhase(null);
    }
  }, [applicationId, rescore, show]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  const improve = async () => {
    if (!score || !app) return;
    const before = { score, app };
    setError(null);
    setPhase("revising");
    let revised: Application;
    try {
      const fixes = [...accepted];
      const typed = fixes.filter((f) => facts[f]?.trim()).map((f) => ({ fix: f, text: facts[f].trim().slice(0, 300) }));
      const r = await settled(() => reviser.run({ applicationId, scoreId: score.id, fixes, facts: typed, stage: "revise" }));
      if (!r) {
        setPhase(null);
        return;
      }
      revised = r.application;
    } catch (e) {
      if (e instanceof ApiClientError && e.paymentRequired) setPaywall(true);
      setError({ text: errorText(e, "No hemos podido aplicar las mejoras ahora mismo. Inténtalo de nuevo."), retry: improve });
      setPhase(null);
      return;
    }
    setPrevious(before);
    setApp(revised);
    await rescoreRevised(before.score);
  };

  /** Phase 2 of "Aplicar mejoras" (also the retry when it failed: the draft is not revised again). */
  const rescoreRevised = async (prev: JuryScore) => {
    setError(null);
    try {
      const r = await rescore("rescoring", prev.judges);
      show(r.score, r.application);
    } catch (e) {
      if (e instanceof ApiClientError && e.paymentRequired) setPaywall(true);
      setError({ text: errorText(e, "Las mejoras están aplicadas, pero el tribunal no ha podido volver a puntuar. Inténtalo de nuevo."), retry: () => rescoreRevised(prev) });
    } finally {
      setPhase(null);
    }
  };

  const undo = async () => {
    if (!app) return;
    setError(null);
    setPhase("undoing");
    try {
      const r = await settled(() => undoer.run(applicationId));
      if (!r) return;
      setPrevious(null);
      if (r.score) show(r.score, r.application);
      else {
        setApp(r.application);
        const s2 = await rescore("scoring", score?.judges);
        show(s2.score, s2.application);
      }
    } catch (e) {
      if (e instanceof ApiClientError && e.paymentRequired) setPaywall(true);
      setError({ text: errorText(e, "No hemos podido deshacer las mejoras. Inténtalo de nuevo."), retry: undo });
    } finally {
      setPhase(null);
    }
  };

  const shown = useCountUp(score?.total ?? 0, previous?.score.total ?? 0);
  const busy = phase !== null;

  const paywallSheet = (
    <Paywall
      open={paywall}
      trigger="jury"
      onClose={() => setPaywall(false)}
      onPurchased={() => {
        setPaywall(false);
        scorer.reset();
        reviser.reset();
        setError(null);
        if (!score) run();
      }}
    />
  );

  const showProgress = phase === "scoring" || phase === "revising" || phase === "rescoring" || phase === "loading";
  const progressList = (live: boolean) => (
    <ul className={s.progress} role={live ? "status" : undefined} aria-live={live ? "polite" : undefined}>
      {(phase === "revising" || phase === "rescoring") && (
        <li className={phase === "revising" ? s.active : s.done}>
          <span className={s.dot} />
          Aplicando mejoras con tus palabras…
        </li>
      )}
      <li className={phase === "revising" ? "" : judges.length && judges.every((j) => j.total !== undefined) ? s.done : s.active}>
        <span className={s.dot} />
        {phase === "rescoring" ? "El tribunal vuelve a leer…" : phase === "loading" ? "Abriendo el tribunal…" : phase === "revising" ? "El tribunal vuelve a leer" : "Los tres jueces están leyendo tu solicitud…"}
      </li>
      {phase !== "revising" &&
        judges.map((j) => (
          <li key={j.judgeId} className={`${s.judgeLine} ${j.total !== undefined ? s.done : ""}`}>
            <span className={s.dot} />
            <span>{j.name}</span>
            <b>{j.total !== undefined ? `${j.total}/100` : "leyendo…"}</b>
          </li>
        ))}
    </ul>
  );
  const progress = showProgress && progressList(true);

  const errorBox = error && (
    <p className={s.error} role="alert">
      {error.text}{" "}
      <Button variant="quiet" onClick={error.retry} disabled={busy}>
        Reintentar
      </Button>
    </p>
  );

  if (!score || !app)
    return (
      <>
        <PageTitle kicker="Tribunal simulado">Tu puntuación</PageTitle>
        {showProgress && (
          <LoadingRegion label="Cargando la puntuación">
            {progressList(false)}
            <JuryScoreSkeleton />
          </LoadingRegion>
        )}
        {errorBox}
        {paywallSheet}
      </>
    );

  const estimated = isEstimated(score);
  const judgeName = (id: string) => score.judges.find((j) => j.id === id)?.name ?? id;
  const fixes = score.criteria.flatMap((c) => c.fixes.map((f) => ({ f, criterionId: c.criterionId, criterion: c.name })));
  const diff = previous ? changes(previous.app, app) : [];
  const d = previous ? score.total - previous.score.total : 0;

  return (
    <>
      <PageTitle kicker="Tribunal simulado">Tu puntuación</PageTitle>
      <div className={s.scoreBox}>
        <p className={s.score} aria-live="polite">
          {shown}
          <small>/100</small>
        </p>
        {previous && phase === null && <span className={`${s.delta} ${d <= 0 ? s.deltaFlat : ""}`}>{deltaText(d)}</span>}
        {score.summary && <p className={s.summary}>{score.summary}</p>}
        <div className={s.judges}>
          {score.judges.map((j) => (
            <Tag key={j.id}>{j.name}</Tag>
          ))}
        </div>
      </div>

      {progress}

      <Card>
        <h2>{estimated ? "Criterios estimados (las bases no publican puntuaciones)" : "Criterios de valoración de las bases"}</h2>
        {score.criteria.map((c) => (
          <div key={c.criterionId} className={s.crit}>
            <div className={s.critHead}>
              <span>{c.name}</span>
              <span>
                {c.points.toLocaleString("es-ES")}/{c.maxPoints}
              </span>
            </div>
            {c.writtenOnly && <p className={s.written}>Valorado por la presentación escrita: el tribunal no ve las imágenes.</p>}
            <div className={s.track}>
              <div className={s.fill} style={{ width: `${(100 * c.points) / c.maxPoints}%` }} />
            </div>
            <ul className={s.comments}>
              {c.byJudge
                .filter((j) => j.comment)
                .map((j) => (
                  <li key={j.judgeId}>
                    <b>
                      {judgeName(j.judgeId)} ({j.points.toLocaleString("es-ES")}):
                    </b>{" "}
                    {j.comment}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </Card>

      {diff.length > 0 && (
        <Card>
          <h2>Qué ha cambiado en tu solicitud</h2>
          <p className={s.note}>Revísalo: tienes la última palabra. Puedes editar cualquier texto en la solicitud o deshacer las mejoras.</p>
          {diff.map((c, i) => (
            <div key={i} className={s.change}>
              <p className={s.changeHead}>
                {c.title} · {c.kind === "added" ? "Añadido" : c.kind === "removed" ? "Eliminado" : "Modificado"}
              </p>
              {c.before && <p className={s.removed}>{c.before}</p>}
              <p className={c.kind === "removed" ? s.removed : s.changed}>{c.text}</p>
            </div>
          ))}
        </Card>
      )}

      {fixes.length > 0 && (
        <Card>
          <h2>Mejoras que proponen</h2>
          <p className={s.note}>Si a una mejora le falta un dato tuyo, escríbelo debajo: lo usaremos tal cual, sin inventar nada.</p>
          {fixes.map(({ f, criterionId, criterion }) => (
            <div key={`${criterionId}-${f}`} className={s.fixRow}>
              <label className={s.fix}>
                <input
                  type="checkbox"
                  checked={accepted.has(f)}
                  disabled={busy}
                  onChange={(e) => {
                    const next = new Set(accepted);
                    if (e.target.checked) next.add(f);
                    else next.delete(f);
                    setAccepted(next);
                  }}
                />
                <span>
                  {f}
                  <br />
                  <small>{criterion}</small>
                </span>
              </label>
              {accepted.has(f) && (
                <input
                  className={s.fact}
                  aria-label={`Dato para: ${f}`}
                  placeholder={factHint(f)}
                  maxLength={300}
                  value={facts[f] ?? ""}
                  disabled={busy}
                  onChange={(e) => setFacts({ ...facts, [f]: e.target.value })}
                />
              )}
            </div>
          ))}
        </Card>
      )}

      {errorBox}
      <p className={s.disclaimer}>{score.disclaimer}</p>
      {/* Phones: "Ver la solicitud" leaves the sticky bar (hidden at >=640px, where it stays in the bar). */}
      <div className={s.mobileLinks}>
        <Link href={ROUTES.application(app.callId)} className="btn btn-quiet">
          Ver la solicitud
        </Link>
      </div>
      <div className={s.actions}>
        {fixes.length > 0 && (
          <Button onClick={improve} disabled={busy || accepted.size === 0}>
            {phase === "revising" ? "Aplicando mejoras…" : phase === "rescoring" ? "El tribunal vuelve a leer…" : "Aplicar mejoras"}
          </Button>
        )}
        {app.previous && (
          <Button variant="ghost" onClick={undo} disabled={busy}>
            {phase === "undoing" ? "Deshaciendo…" : "Deshacer mejoras"}
          </Button>
        )}
        <Link href={ROUTES.application(app.callId)} className={`btn btn-quiet ${s.deskOnly}`}>
          Ver la solicitud
        </Link>
      </div>
      {paywallSheet}
    </>
  );
}

