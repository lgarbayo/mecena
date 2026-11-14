"use client";
/**
 * /onboarding, step by step: choose voice or text, then one question per screen with a progress bar.
 * Same pipeline as the live onboarding: every answer (typed, or each final voice chunk) becomes a queued turn
 * (POST /api/onboarding/turn) that fills the profile and the dossier in the background.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API, ROUTES, type Profile, type ProfileKind } from "@/contracts";
import type { ImportDossierResponse, OnboardingTurnResponse } from "@/contracts/api";
import { useApp } from "@/components/shell/AppProvider";
import { useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { apiGet, apiSend } from "@/lib/api-client";
import { FIELD_LABELS, HOME, LEGAL_FORM_LABELS, ONBOARDING } from "../copy";
import { STEPS_COPY as C, stepsFor } from "../steps";
import { TurnQueue, type QueuedTurn } from "../turnQueue";
import { MicIcon } from "./icons";
import { ImportDossier } from "./ImportDossier";
import { MatchesPanel } from "./MatchesPanel";
import { ONBOARDING_STATE_API } from "./OnboardingClient";
import { Stage, glass as g } from "./Stage";
import { VoiceOrb } from "./VoiceOrb";
import s from "./steps.module.css";

type Mode = "voice" | "text";
type Phase = { at: "choose" } | { at: "step"; i: number } | { at: "done" };

const filled = (p: Profile | null, fields: string[]) =>
  !!p &&
  fields.some((f) => {
    const v = (p as Record<string, unknown>)[f];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "";
  });

function extractLiveTags(p: Profile | null): { label: string; value: string }[] {
  if (!p) return [];
  const tags: { label: string; value: string }[] = [];
  if (p.displayName) tags.push({ label: p.kind === "business" ? "Empresa" : "Nombre", value: p.displayName });
  if (p.city || p.region) tags.push({ label: "Ciudad", value: p.city || p.region || "" });
  if (p.kind === "creator" && p.disciplines.length > 0) {
    tags.push({ label: "Disciplina", value: p.disciplines.slice(0, 2).join(", ") });
  }
  if (p.kind === "business" && p.sector) {
    tags.push({ label: "Sector", value: p.sector });
  }
  if (p.legalForm) {
    tags.push({ label: "Forma", value: LEGAL_FORM_LABELS[p.legalForm] ?? p.legalForm });
  }
  if (p.fundingNeeds.length > 0) {
    const need = p.fundingNeeds[0];
    tags.push({ label: "Necesidad", value: need.length > 34 ? `${need.slice(0, 32)}…` : need });
  } else if (p.projectIdea) {
    const idea = p.projectIdea;
    tags.push({ label: "Proyecto", value: idea.length > 34 ? `${idea.slice(0, 32)}…` : idea });
  }
  return tags;
}

function PenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function StepOnboarding() {
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;
  const kind: ProfileKind = app.profile?.kind ?? "creator";
  const steps = useMemo(() => stepsFor(kind), [kind]);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const [phase, setPhase] = useState<Phase>({ at: "choose" });
  const [mode, setMode] = useState<Mode>("voice");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [liveProfile, setLiveProfile] = useState<Profile | null>(null);
  const [, setIsFirstTurn] = useState(true);
  const firstTurnRef = useRef(false);
  const stepKeyQueueRef = useRef<(string | undefined)[]>([]);
  const stepIndexRef = useRef(0);
  stepIndexRef.current = phase.at === "step" ? phase.i : 0;

  const [turns, setTurns] = useState<QueuedTurn[]>([]);
  const [followUp, setFollowUp] = useState<string>();
  const [noted, setNoted] = useState<{ text: string; key: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [heard, setHeard] = useState("");
  const [pulse, setPulse] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [voiceOk, setVoiceOk] = useState(true);

  const profileId = app.profile?.id;
  const pidRef = useRef(profileId);
  pidRef.current = profileId;

  const stepKeyFor = useCallback((idx: number): string | undefined => {
    const st = stepsRef.current[idx] as ((typeof steps)[number] & { key?: string }) | undefined;
    return st?.key ?? st?.fields[0] ?? `step-${idx + 1}`;
  }, []);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceOk(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    setShowImport(new URLSearchParams(window.location.search).get("subir") === "1");
  }, []);

  useEffect(() => {
    if (!profileId) return;
    apiGet<{ profile: Profile; transcript?: unknown[] }>(`${ONBOARDING_STATE_API}?profileId=${encodeURIComponent(profileId)}`)
      .then((st) => {
        const untouchedBusinessSeed =
          st.profile.kind === "business" &&
          st.profile.displayName === "Cerámica Mareira" &&
          st.profile.cnae === "2341" &&
          Array.isArray(st.transcript) &&
          st.transcript.length === 0;
        if (untouchedBusinessSeed) {
          setProfile({
            ...st.profile,
            displayName: "",
            city: undefined,
            province: undefined,
            region: undefined,
            territory: undefined,
            legalForm: undefined,
            cnae: undefined,
            sector: undefined,
            employees: undefined,
            foundedYear: undefined,
            annualRevenueEur: undefined,
            bio: "",
            statement: "",
            achievements: [],
            education: [],
            links: [],
            fundingNeeds: [],
            projectIdea: undefined,
          });
        } else {
          setProfile(st.profile);
        }
      })
      .catch(() => undefined);
  }, [profileId]);

  const onResult = useCallback((res: OnboardingTurnResponse) => {
    setProfile(res.profile);
    setLiveProfile(res.profile);
    if (res.followUpQuestion) setFollowUp(res.followUpQuestion);
    const labels = res.changedProfileFields.map((f) => FIELD_LABELS[f]).filter(Boolean);
    if (labels.length) setNoted({ text: ONBOARDING.noted(labels.join(", ")), key: Date.now() });
    if (res.changedProfileFields.length) appRef.current.refresh().catch(() => undefined);
  }, []);

  const queue = useMemo(
    () =>
      new TurnQueue(
        (t, signal) => {
          const stepKey = stepKeyQueueRef.current.shift() ?? stepKeyFor(stepIndexRef.current);
          const reset = firstTurnRef.current;
          if (reset) {
            firstTurnRef.current = false;
            setIsFirstTurn(false);
          }
          return apiSend<OnboardingTurnResponse>(
            API.onboardingTurn,
            { ...t, profileId: pidRef.current, stepKey, reset },
            "POST",
            signal,
          );
        },
        { change: setTurns, result: onResult },
      ),
    [onResult, stepKeyFor],
  );

  const send = useCallback(
    (stepKey: string | undefined, raw: string, source: "voice" | "text") => {
      const clean = raw.trim();
      if (!clean) return;
      stepKeyQueueRef.current.push(stepKey);
      queue.enqueue(clean, source);
    },
    [queue],
  );

  const speech = useSpeechRecognition({
    onFinal: (text) => {
      if (!text) return;
      send(stepKeyFor(stepIndexRef.current), text, "voice");
      setHeard(text);
      setPulse((p) => p + 1);
    },
  });
  useEffect(() => {
    if (speech.interim) setPulse((p) => p + 1);
  }, [speech.interim]);

  const busy = turns.some((t) => t.status === "sending" || t.status === "queued");
  const failed = turns.find((t) => t.status === "failed");
  const slow = turns.some((t) => t.slow);
  const total = steps.length;
  const stepIndex = phase.at === "step" ? phase.i : phase.at === "done" ? total : 0;

  const chooseKind = (k: ProfileKind) => {
    firstTurnRef.current = true;
    setIsFirstTurn(true);
    setLiveProfile(null);
    void app.setMode(k);
  };

  const start = (m: Mode) => {
    firstTurnRef.current = true;
    setIsFirstTurn(true);
    setLiveProfile(null);
    setMode(m);
    setPhase({ at: "step", i: 0 });
    if (m === "voice") speech.start();
  };

  const go = (i: number) => {
    const currentKey = stepKeyFor(stepIndexRef.current);
    if (mode === "text" && draft.trim()) {
      send(currentKey, draft.trim(), "text");
      setDraft("");
    } else if (mode === "voice") {
      const maybeFlush = (speech as { flush?: () => void }).flush;
      if (maybeFlush) maybeFlush();
      else if (speech.interim.trim()) send(currentKey, speech.interim.trim(), "voice");
    }
    setHeard("");
    setFollowUp(undefined);
    if (i >= total) {
      speech.stop();
      setPhase({ at: "done" });
    } else if (i < 0) {
      speech.stop();
      setPhase({ at: "choose" });
    } else {
      setPhase({ at: "step", i });
      if (mode === "voice") speech.start();
    }
  };

  const onImported = (res: ImportDossierResponse) => {
    onResult({ ...res, segmentId: res.segmentIds.at(-1) ?? "" });
    setShowImport(false);
  };

  const micError = speech.error && !/no-speech|aborted/.test(speech.error) ? speech.error : null;
  const activeProfile = liveProfile ?? profile;
  const liveTags = useMemo(() => extractLiveTags(activeProfile), [activeProfile]);

  return (
    <Stage label="Cuéntanos">
      <div className={s.wrap}>
        <header className={s.top}>
          <div className={s.topRow}>
            <Link href={ROUTES.home} className={g.brand}>
              Mecena
            </Link>
            {phase.at !== "choose" && (
              <span className={s.progressText} aria-live="polite">
                {phase.at === "done" ? "Listo" : C.step(stepIndex + 1, total)}
              </span>
            )}
            <Link href={ROUTES.home} className={s.close} aria-label="Salir">
              ×
            </Link>
          </div>
          {phase.at !== "choose" && (
            <>
              <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(total, stepIndex + (phase.at === "done" ? 0 : 1))}>
                <div className={s.barFill} style={{ width: `${(100 * (phase.at === "done" ? total : stepIndex + 1)) / total}%` }} />
              </div>
              <div className={s.dots} aria-hidden>
                {steps.map((st, i) => (
                  <span key={st.question} className={`${s.dotStep} ${i === stepIndex && phase.at === "step" ? s.dotNow : filled(activeProfile, st.fields) ? s.dotDone : ""}`} />
                ))}
              </div>
            </>
          )}
        </header>

        {phase.at === "choose" && (
          <section className={s.body} key="choose">
            <p className={g.kicker}>{ONBOARDING.kicker[kind]}</p>
            <h1 className={s.question}>{C.chooseTitle}</h1>
            <p className={s.example}>{C.chooseLede}</p>
            <div className={s.kinds} role="group" aria-label="Perfil">
              {(["creator", "business"] as const).map((k) => (
                <button key={k} type="button" className={s.kind} aria-pressed={kind === k} onClick={() => chooseKind(k)}>
                  {C.kind[k]}
                </button>
              ))}
            </div>
            <div className={s.choices}>
              <button type="button" className={`${g.glass} ${s.choice}`} onClick={() => start("voice")} disabled={!voiceOk} data-testid="choose-voice">
                <span className={s.choiceIcon}>
                  <MicIcon />
                </span>
                <strong>{C.voice.label}</strong>
                <small>{voiceOk ? C.voice.hint : ONBOARDING.unsupported}</small>
              </button>
              <button type="button" className={`${g.glass} ${s.choice}`} onClick={() => start("text")} data-testid="choose-text">
                <span className={s.choiceIcon}>
                  <PenIcon />
                </span>
                <strong>{C.text.label}</strong>
                <small>{C.text.hint}</small>
              </button>
            </div>
            {showImport ? (
              <div className={s.importBox}>
                <ImportDossier kind={kind} profileId={profileId} onImported={onImported} defaultOpen />
              </div>
            ) : (
              <button type="button" className={s.link} onClick={() => setShowImport(true)}>
                {C.importLink}
              </button>
            )}
          </section>
        )}

        {phase.at === "step" && (
          <section className={s.body}>
            <div key={`step-${phase.i}`}>
              {followUp ? (
                <h1 className={`${s.question} ${s.questionLoaded}`}>{followUp}</h1>
              ) : busy ? (
                <div className={s.questionSkeleton} aria-busy="true" aria-label="Cargando pregunta…">
                  <div className={s.skeletonLine} style={{ width: "85%" }} />
                  <div className={s.skeletonLine} style={{ width: "60%" }} />
                </div>
              ) : (
                <h1 className={s.question}>{steps[phase.i].question}</h1>
              )}
              <p className={s.example}>{steps[phase.i].example}</p>
            </div>

            {mode === "voice" ? (
              <div className={s.voice}>
                <button
                  type="button"
                  className={s.orbBtn}
                  onClick={speech.listening ? speech.stop : speech.start}
                  aria-pressed={speech.listening}
                  aria-label={speech.listening ? C.tapToPause : C.tapToTalk}
                  data-testid="orb"
                >
                  <VoiceOrb active={speech.listening} pulse={pulse} size={260} />
                </button>
                <span className={s.orbLabel}>{speech.listening ? C.listening : C.tapToTalk}</span>
                <p className={s.said} aria-live="polite">
                  {speech.interim ? <em>{speech.interim}</em> : heard}
                </p>
                {micError && <p className={s.micError}>{micError}</p>}
              </div>
            ) : (
              <textarea
                className={`${g.glass} ${s.answer}`}
                value={draft}
                autoFocus
                placeholder={ONBOARDING.textPlaceholder}
                aria-label={steps[phase.i].question}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    go(phase.i + 1);
                  }
                }}
              />
            )}

            {(busy || liveTags.length > 0) && (
              <div className={`${g.glass} ${s.liveStrip}`} aria-live="polite" data-testid="live-profile-strip">
                {busy && <span className={s.liveAnalyzing}>Analizando respuesta…</span>}
                {liveTags.length > 0 && (
                  <div className={s.liveTags}>
                    <span className={s.livePrefix}>Detectado:</span>
                    {liveTags.map((t) => (
                      <span key={`${t.label}-${t.value}`} className={s.liveChip}>
                        <b>{t.label}:</b> {t.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {phase.at === "done" && (
          <section className={s.body} key="done">
            <h1 className={s.question}>{C.doneTitle[kind]}</h1>
            {failed ? (
              <p className={s.example} role="alert">
                {ONBOARDING.failed}{" "}
                <button type="button" className={s.link} onClick={() => queue.retry(failed.id)}>
                  {ONBOARDING.retry}
                </button>
              </p>
            ) : (
              <p className={s.example}>{busy ? (slow ? ONBOARDING.slow : ONBOARDING.sending) : C.doneLede}</p>
            )}

            <div className={`${g.glass} ${s.fitProcess}`} data-testid="fitting-pipeline">
              <div className={s.fitSteps}>
                <span className={`${s.fitStep} ${s.fitStepDone}`}>1. Perfil extraído</span>
                <span className={`${s.fitStep} ${busy ? s.fitStepActive : s.fitStepDone}`}>2. Filtrando requisitos y territorio</span>
                <span className={`${s.fitStep} ${busy ? "" : s.fitStepDone}`}>3. Calculando afinidad artística/sectorial</span>
              </div>
              {liveTags.length > 0 && (
                <div className={s.liveTags}>
                  <span className={s.livePrefix}>Detectado:</span>
                  {liveTags.map((t) => (
                    <span key={`${t.label}-${t.value}`} className={s.liveChip}>
                      <b>{t.label}:</b> {t.value}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <dl className={`${g.glass} ${s.summary}`}>
              {Object.entries(FIELD_LABELS)
                .filter(([f]) => filled(activeProfile, [f]))
                .map(([f, label]) => {
                  const v = (activeProfile as Record<string, unknown>)[f];
                  return (
                    <div key={f} className={s.row}>
                      <dt>{label}</dt>
                      <dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                    </div>
                  );
                })}
              {!Object.keys(FIELD_LABELS).some((f) => filled(activeProfile, [f])) && <p className={s.example}>{C.doneEmpty}</p>}
            </dl>

            <div className={s.importBox}>
              <MatchesPanel
                profileId={profileId}
                appUserId={app.appUserId || undefined}
                refreshKey={turns.filter((t) => t.status === "done").length}
                knowsEnough={Boolean((activeProfile?.sector || activeProfile?.disciplines?.length) && (activeProfile?.city || activeProfile?.region))}
              />
            </div>

            <div className={s.ctas}>
              <Link
                className={`${g.btn} ${g.btnPrimary} ${busy ? s.ctaDisabled : ""}`}
                href={kind === "creator" ? ROUTES.works : ROUTES.calls}
                aria-disabled={busy}
                onClick={(e) => {
                  if (busy) e.preventDefault();
                }}
                data-testid="finish-cta"
              >
                {busy ? "Calculando tu encaje…" : ONBOARDING.finish[kind].cta}
              </Link>
              <Link
                className={`${g.btn} ${busy ? s.ctaDisabled : ""}`}
                href={ROUTES.calls}
                aria-disabled={busy}
                onClick={(e) => {
                  if (busy) e.preventDefault();
                }}
              >
                {busy ? "Calculando tu encaje…" : C.toCalls}
              </Link>
            </div>
          </section>
        )}

        <footer className={s.foot}>
          {phase.at === "step" ? (
            <>
              <button type="button" className={`${g.btn} ${g.btnQuiet}`} onClick={() => go(phase.i - 1)}>
                {C.back}
              </button>
              <span className={`${s.status} ${s.grow}`} aria-live="polite">
                {failed ? (
                  <button type="button" className={s.link} onClick={() => queue.retry(failed.id)}>
                    {ONBOARDING.retry}
                  </button>
                ) : busy ? (
                  slow ? ONBOARDING.slow : ONBOARDING.sending
                ) : (
                  ""
                )}
              </span>
              <button type="button" className={`${g.btn} ${g.btnPrimary}`} onClick={() => go(phase.i + 1)} data-testid="next">
                {phase.i + 1 === total ? C.finishStep : mode === "text" && !draft.trim() ? C.skip : C.next}
              </button>
            </>
          ) : phase.at === "done" ? (
            <button type="button" className={`${g.btn} ${g.btnQuiet}`} onClick={() => go(total - 1)}>
              {C.back}
            </button>
          ) : (
            <Link className={`${g.btn} ${g.btnQuiet}`} href={ROUTES.trust}>
              {HOME.secondary}
            </Link>
          )}
        </footer>

        {noted && (
          <p key={noted.key} className={`${g.glass} ${s.toast}`} role="status">
            {noted.text}
          </p>
        )}
      </div>
    </Stage>
  );
}
