"use client";
// WP-08 /tribunal/[applicationId]: 3 judges on the official criteria, fixes to accept, "Aplicar mejoras" re-scores live.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { API, ROUTES, type Application, type JuryScore } from "@/contracts";
import { Button, Card, PageTitle, Spinner, Tag } from "@/components/ui";
import { ApiClientError, apiGet, apiSend } from "@/lib/api-client";
import { Paywall } from "@/features/purchases/ui/Paywall";
import s from "./jury.module.css";

/** Animated count-up between two totals (instant when the user prefers reduced motion). */
function useCountUp(target: number, from: number) {
  const [n, setN] = useState(from);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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

/** Paragraphs that are new in the revised draft (what the improvement changed). */
function changes(before: Application, after: Application): { title: string; text: string }[] {
  return after.sections.flatMap((sec) => {
    const old = before.sections.find((x) => x.key === sec.key)?.body ?? "";
    const oldParas = new Set(old.split(/\n\n+/).map((p) => p.trim()));
    return sec.body
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p && !oldParas.has(p))
      .map((text) => ({ title: sec.title, text }));
  });
}

export function JuryPage({ applicationId }: { applicationId: string }) {
  const [score, setScore] = useState<JuryScore | null>(null);
  const [app, setApp] = useState<Application | null>(null);
  const [previous, setPrevious] = useState<{ score: JuryScore; app: Application } | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"scoring" | "improving" | null>("scoring");
  const [error, setError] = useState<string | null>(null);
  // 402: the runs included with a Solicitud premium are used up (the jury is Pro)
  const [paywall, setPaywall] = useState(false);
  const started = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setBusy("scoring");
    try {
      const latest = await apiGet<{ score: JuryScore | null; application: Application }>(`${API.jury}?applicationId=${encodeURIComponent(applicationId)}`);
      const r = latest.score && latest.score.applicationVersion === latest.application.version ? latest : await apiSend<{ score: JuryScore; application: Application }>(API.jury, { applicationId });
      setScore(r.score);
      setApp(r.application);
      setAccepted(new Set(r.score!.criteria.flatMap((c) => c.fixes)));
    } catch (e) {
      if (e instanceof ApiClientError && e.paymentRequired) setPaywall(true);
      setError(e instanceof ApiClientError && e.status === 502 ? "El tribunal no ha podido puntuar ahora mismo." : e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  }, [applicationId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  const improve = async () => {
    if (!score || !app) return;
    setBusy("improving");
    setError(null);
    try {
      const r = await apiSend<{ application: Application; score: JuryScore }>(API.juryImprove, { applicationId, scoreId: score.id, fixes: [...accepted] });
      setPrevious({ score, app });
      setScore(r.score);
      setApp(r.application);
      setAccepted(new Set(r.score.criteria.flatMap((c) => c.fixes)));
    } catch (e) {
      if (e instanceof ApiClientError && e.paymentRequired) setPaywall(true);
      setError(e instanceof Error ? e.message : "No se pudieron aplicar las mejoras");
    } finally {
      setBusy(null);
    }
  };

  const shown = useCountUp(score?.total ?? 0, previous?.score.total ?? 0);
  const paywallSheet = (
    <Paywall
      open={paywall}
      trigger="jury"
      onClose={() => setPaywall(false)}
      onPurchased={() => {
        setPaywall(false);
        setError(null);
        if (!score) run();
      }}
    />
  );

  if (!score || !app)
    return (
      <>
        <PageTitle kicker="Tribunal simulado">Tu puntuación</PageTitle>
        {busy ? <Spinner label="Los tres jueces están leyendo tu solicitud…" /> : null}
        {error && (
          <p className={s.error}>
            {error}{" "}
            <Button variant="quiet" onClick={run}>
              Reintentar
            </Button>
          </p>
        )}
        {paywallSheet}
      </>
    );

  const judgeName = (id: string) => score.judges.find((j) => j.id === id)?.name ?? id;
  const fixes = score.criteria.flatMap((c) => c.fixes.map((f) => ({ f, criterion: c.name })));
  const diff = previous ? changes(previous.app, app) : [];

  return (
    <>
      <PageTitle kicker="Tribunal simulado">Tu puntuación</PageTitle>
      <div className={s.scoreBox}>
        <p className={s.score} aria-live="polite">
          {shown}
          <small>/100</small>
        </p>
        {previous && <span className={s.delta}>+{score.total - previous.score.total} puntos tras las mejoras</span>}
        {score.summary && <p className={s.summary}>{score.summary}</p>}
        <div className={s.judges}>
          {score.judges.map((j) => (
            <Tag key={j.id}>{j.name}</Tag>
          ))}
        </div>
      </div>

      <Card>
        <h2>Criterios de las bases</h2>
        {score.criteria.map((c) => (
          <div key={c.criterionId} className={s.crit}>
            <div className={s.critHead}>
              <span>{c.name}</span>
              <span>
                {c.points.toLocaleString("es-ES")}/{c.maxPoints}
              </span>
            </div>
            <div className={s.track}>
              <div className={s.fill} style={{ width: `${(100 * c.points) / c.maxPoints}%` }} />
            </div>
            <ul className={s.comments}>
              {c.byJudge
                .filter((j) => j.comment)
                .map((j) => (
                  <li key={j.judgeId}>
                    <b>{judgeName(j.judgeId)}:</b> {j.comment}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </Card>

      {diff.length > 0 && (
        <Card>
          <h2>Qué ha cambiado en tu solicitud</h2>
          {diff.map((d, i) => (
            <div key={i}>
              <p className={s.summary} style={{ margin: "8px 0 0", textAlign: "left" }}>
                {d.title}
              </p>
              <p className={s.changed}>{d.text}</p>
            </div>
          ))}
        </Card>
      )}

      {fixes.length > 0 && (
        <Card>
          <h2>Mejoras que proponen</h2>
          {fixes.map(({ f, criterion }) => (
            <label key={f} className={s.fix}>
              <input
                type="checkbox"
                checked={accepted.has(f)}
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
          ))}
        </Card>
      )}

      {error && <p className={s.error}>{error}</p>}
      <p className={s.disclaimer}>{score.disclaimer}</p>
      <div className={s.actions}>
        {fixes.length > 0 && (
          <Button onClick={improve} disabled={busy !== null || accepted.size === 0}>
            {busy === "improving" ? "Aplicando mejoras…" : "Aplicar mejoras"}
          </Button>
        )}
        <Link href={ROUTES.application(app.callId)} className="btn btn-ghost">
          Ver la solicitud
        </Link>
      </div>
      {paywallSheet}
    </>
  );
}
