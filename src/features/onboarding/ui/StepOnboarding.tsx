"use client";
/**
 * /onboarding, step by step: choose voice or text, then one question per screen with a progress bar.
 * Every answer (typed, or each final voice chunk) becomes a queued turn (POST /api/onboarding/turn) and, while the
 * person talks, the profile and the dossier grow on screen section by section next to the transcript (LiveDossier).
 * Creators can photograph a work without leaving the conversation (PhotoSheet). Leaving waits for the queue.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { API, ROUTES, type DossierSection, type Profile, type ProfileKind, type TranscriptSegment, type Work } from "@/contracts";
import type { ImportDossierResponse, OnboardingTurnResponse } from "@/contracts/api";
import { useApp } from "@/components/shell/AppProvider";
import { MIC_BLOCKED, useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { worksClient } from "@/features/works/client";
import { apiGet, apiSend } from "@/lib/api-client";
import { ONBOARDING, fieldLabel } from "../copy";
import { isVisualFamily, onboardingFamily } from "../family";
import { STEPS_COPY as C, stepsFor } from "../steps";
import { TurnQueue, type QueuedTurn } from "../turnQueue";
import { filledRows } from "./format";
import { MicIcon } from "./icons";
import { ImportDossier } from "./ImportDossier";
import { LiveDossier } from "./LiveDossier";
import { MatchesPanel } from "./MatchesPanel";
import { PhotoSheet } from "./PhotoSheet";
import { Stage, glass as g } from "./Stage";
import { Transcript, type TranscriptLine } from "./Transcript";
import { TrustStrip } from "./TrustStrip";
import { VoiceOrb } from "./VoiceOrb";
import l from "./live.module.css";
import s from "./steps.module.css";
import { Icon } from "@/components/ui/icons";

/** GET current onboarding state (profile, dossier sections, transcript), owned by WP-01. */
export const ONBOARDING_STATE_API = "/api/onboarding";
/** How long a changed section / profile chip stays highlighted. */
const FLASH_MS = 2600;

type Mode = "voice" | "text";
type Phase = { at: "choose" } | { at: "step"; i: number } | { at: "done" };
interface State {
  profile: Profile;
  sections: DossierSection[];
  transcript: TranscriptSegment[];
}

function PenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

export function StepOnboarding() {
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;
  const router = useRouter();
  const kind: ProfileKind = app.profile?.kind ?? "creator";
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const steps = useMemo(() => stepsFor(kind), [kind]);

  const [phase, setPhase] = useState<Phase>({ at: "choose" });
  const [mode, setMode] = useState<Mode>("voice");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sections, setSections] = useState<DossierSection[]>([]);
  const [history, setHistory] = useState<TranscriptSegment[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [freshWork, setFreshWork] = useState<string | null>(null);
  const [turns, setTurns] = useState<QueuedTurn[]>([]);
  const [followUp, setFollowUp] = useState<string>();
  const [noted, setNoted] = useState<{ text: string; key: number } | null>(null);
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());
  const [changedSections, setChangedSections] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState("");
  const [pulse, setPulse] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [voiceOk, setVoiceOk] = useState(true);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  /** The person asked to start over: the next onboarding's first turn wipes the earlier one (server-side reset). */
  const [restart, setRestart] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resumeAfterPhoto = useRef(false);
  /** Turns of the queue that belong to an earlier profile (before a creator <-> pyme switch) are not shown. */
  const turnsOffset = useRef(0);

  const total = steps.length;
  const stepIndex = phase.at === "step" ? phase.i : phase.at === "done" ? total : 0;
  /** The step the person is on now; a turn's follow-up question from an earlier step is stale. */
  const stepRef = useRef(-1);
  stepRef.current = phase.at === "step" ? phase.i : phase.at === "done" ? total : -1;

  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  /** Set when a new onboarding starts: its first turn resets what an earlier one left in the profile. */
  const freshRef = useRef(false);

  const profileId = app.profile?.id;
  const pidRef = useRef(profileId);
  pidRef.current = profileId;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVoiceOk(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    setShowImport(new URLSearchParams(window.location.search).get("subir") === "1");
  }, []);

  const loadState = useCallback((id: string) => {
    apiGet<State>(`${ONBOARDING_STATE_API}?profileId=${encodeURIComponent(id)}`)
      .then((st) => {
        if (pidRef.current !== id) return;
        const untouchedSeed = st.profile.kind === "business" && st.profile.displayName === "Cerámica Mareira" && st.profile.cnae === "2341" && (st.transcript ?? []).length === 0;
        setProfile(untouchedSeed ? { ...st.profile, displayName: "", city: undefined, province: undefined, region: undefined, territory: undefined, legalForm: undefined, cnae: undefined, sector: undefined, employees: undefined, foundedYear: undefined, annualRevenueEur: undefined, bio: "", statement: "", achievements: [], education: [], links: [], fundingNeeds: [], projectIdea: undefined } : st.profile);
        setSections(st.sections ?? []);
        setHistory(st.transcript ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!profileId) return;
    loadState(profileId);
    setFollowUp(undefined);
    setRestart(false);
    if (kindRef.current !== "creator") return setWorks([]);
    worksClient
      .list(profileId)
      .then((ws) => pidRef.current === profileId && setWorks(Array.isArray(ws) ? ws : []))
      .catch(() => undefined);
  }, [profileId, loadState]);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const onResult = useCallback((res: OnboardingTurnResponse, turn?: QueuedTurn) => {
    setProfile(res.profile);
    setSections(res.sections);
    // A question for a step the person has already left would answer the wrong screen.
    const stale = turn?.step !== undefined && turn.step < stepRef.current;
    if (res.followUpQuestion && !stale) setFollowUp(res.followUpQuestion);
    setChangedFields(new Set(res.changedProfileFields));
    setChangedSections(new Set(res.changedSectionKeys));
    setVersion((v) => v + 1);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setChangedFields(new Set());
      setChangedSections(new Set());
    }, FLASH_MS);
    const labels = res.changedProfileFields.map((f) => fieldLabel(kindRef.current, f)).filter(Boolean);
    if (labels.length) setNoted({ text: ONBOARDING.noted(labels.join(", ")), key: Date.now() });
    if (res.changedProfileFields.length) appRef.current.refresh().catch(() => undefined);
  }, []);

  const queue = useMemo(
    () =>
      new TurnQueue(
        (t, signal) => {
          // The first turn of a fresh onboarding starts the profile from scratch (server-side reset).
          const reset = freshRef.current;
          freshRef.current = false;
          const stepKey = t.step === undefined ? undefined : (stepsRef.current[t.step]?.fields[0] ?? `step-${t.step + 1}`);
          return apiSend<OnboardingTurnResponse>(API.onboardingTurn, { text: t.text, source: t.source, profileId: pidRef.current, stepKey, reset }, "POST", signal);
        },
        { change: setTurns, result: onResult },
      ),
    [onResult],
  );

  const speech = useSpeechRecognition({
    onFinal: (text) => {
      if (!text) return;
      queue.enqueue(text, "voice", Math.max(0, stepRef.current));
      setPulse((p) => p + 1);
    },
  });
  useEffect(() => {
    if (speech.interim) setPulse((p) => p + 1);
  }, [speech.interim]);

  // No microphone (denied, blocked or missing): voice cannot work, so carry on typing on the same step.
  const blocked = !!speech.errorCode && MIC_BLOCKED.has(speech.errorCode);
  useEffect(() => {
    if (!blocked) return;
    speech.stop();
    setMode("text");
    setMicNotice(speech.error ?? ONBOARDING.micDenied);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to a new blocking error only
  }, [blocked, speech.errorCode]);

  const shownTurns = turns.slice(turnsOffset.current);
  const busy = shownTurns.some((t) => t.status === "sending" || t.status === "queued");
  const failed = shownTurns.find((t) => t.status === "failed");
  const slow = shownTurns.some((t) => t.slow);

  // Leaving while answers are still on their way: wait for the queue, then go. A tab close gets the browser's prompt.
  useEffect(() => {
    if (!busy && !failed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, failed]);
  useEffect(() => {
    if (leaving && !busy && !failed) router.push(leaving);
  }, [leaving, busy, failed, router]);
  const guard = (href: string) => (e: MouseEvent) => {
    speech.stop();
    if (!busy && !failed) return;
    e.preventDefault();
    setLeaving(href);
  };

  // Something is already on file (an earlier interview, an imported dossier): never wipe it without being asked.
  const hasPrevious = history.length > 0 || sections.length > 0 || filledRows(kind, profile).length > 0;
  const start = (m: Mode) => {
    freshRef.current = !hasPrevious || restart;
    setRestart(false);
    setMode(m);
    setMicNotice(null);
    setPhase({ at: "step", i: 0 });
    if (m === "voice") speech.start();
  };

  const toText = () => {
    speech.flush(); // what is still being said is queued now: stop() would drop the interim text
    speech.stop();
    setMode("text");
  };
  const toVoice = () => {
    // The textarea unmounts with the switch: what was typed is queued as an answer, not left behind unseen.
    if (draft.trim() && phase.at === "step") {
      queue.enqueue(draft.trim(), "text", phase.i);
      setDraft("");
    }
    setMicNotice(null);
    setMode("voice");
    speech.start();
  };

  const go = (i: number) => {
    if (mode === "text" && draft.trim() && phase.at === "step") {
      queue.enqueue(draft.trim(), "text", phase.i);
      setDraft("");
    } else if (mode === "voice" && phase.at === "step") {
      // What is still being said is not lost: the hook hands it out, or we queue the interim text ourselves.
      const flush = (speech as { flush?: () => void }).flush;
      if (flush) flush();
      else if (speech.interim.trim()) queue.enqueue(speech.interim.trim(), "voice", phase.i);
    }
    setFollowUp(undefined);
    if (i >= total) {
      speech.stop();
      setPhase({ at: "done" });
    } else if (i < 0) {
      speech.stop();
      setPhase({ at: "choose" });
    } else setPhase({ at: "step", i });
  };

  const switchKind = async (k: ProfileKind) => {
    if (k === kind || switching || busy) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      await app.setMode(k);
      turnsOffset.current = queue.snapshot.length;
      setTurns([...queue.snapshot]);
      setSections([]);
      setHistory([]);
    } catch {
      setSwitchError(C.switchFailed);
    } finally {
      setSwitching(false);
    }
  };

  const openPhoto = () => {
    resumeAfterPhoto.current = speech.listening;
    speech.stop(); // the sheet dictates the work's sheet with its own microphone
    setPhotoOpen(true);
  };
  const closePhoto = useCallback(() => {
    setPhotoOpen(false);
    if (resumeAfterPhoto.current) speechStart.current();
    resumeAfterPhoto.current = false;
  }, []);
  const speechStart = useRef(speech.start);
  speechStart.current = speech.start;
  const onWork = useCallback((w: Work) => {
    setWorks((ws) => [...ws.filter((x) => x.id !== w.id), w]);
    setFreshWork(w.id);
  }, []);

  const onImported = (res: ImportDossierResponse) => {
    onResult({ ...res, segmentId: res.segmentIds.at(-1) ?? "" });
    if (profileId) loadState(profileId);
    setShowImport(false);
  };

  const quietError = speech.error && speech.errorCode && !/no-speech|aborted/.test(speech.errorCode) && !blocked ? speech.error : null;
  const lines: TranscriptLine[] = [...history.map((h) => ({ id: h.id, text: h.text, status: "done" as const })), ...shownTurns.map((t) => ({ id: t.id, text: t.text, status: t.status }))];
  const finishCopy = kind === "creator" && !isVisualFamily(onboardingFamily(profile?.disciplines)) ? ONBOARDING.finish.creatorLive : ONBOARDING.finish[kind];
  const rows = filledRows(kind, profile);
  // A failed turn is retried from its line in the transcript; the footer only says so.
  const queueStatus = failed ? C.turnStatus.failed : busy ? (slow ? ONBOARDING.slow : ONBOARDING.sending) : "";

  const live = (
    <LiveDossier kind={kind} profile={profile} sections={sections} changedSections={changedSections} changedFields={changedFields} version={version} works={kind === "creator" ? works : []} freshWorkId={freshWork} />
  );
  const photoButton = kind === "creator" && (
    <button type="button" className={`${g.btn} ${s.iconBtn}`} onClick={openPhoto} aria-label={C.photoWork} title={C.photoWork} data-testid="photo-work">
      <CameraIcon />
    </button>
  );

  return (
    <Stage label="Cuéntanos">
      <div className={s.wrap}>
        <header className={s.top}>
          <div className={s.topRow}>
            <Link href={ROUTES.home} className={g.brand} onClick={guard(ROUTES.home)}>
              Mecena
            </Link>
            {phase.at !== "choose" && (
              <span className={s.progressText} aria-live="polite">
                {phase.at === "done" ? "Listo" : C.step(stepIndex + 1, total)}
              </span>
            )}
            <Link href={ROUTES.home} className={s.close} aria-label="Salir" onClick={guard(ROUTES.home)} data-testid="exit">
              <Icon name="close" size={18} />
            </Link>
          </div>
          {phase.at !== "choose" && (
            <>
              <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(total, stepIndex + (phase.at === "done" ? 0 : 1))}>
                <div className={s.barFill} style={{ width: `${(100 * (phase.at === "done" ? total : stepIndex + 1)) / total}%` }} />
              </div>
            </>
          )}
        </header>

        {phase.at === "choose" && (
          <section className={`${s.body} ${s.chooseBody}`} key="choose">
            <div className={s.kinds} role="group" aria-label="Perfil" aria-busy={switching}>
              {(["creator", "business"] as const).map((k) => (
                <button key={k} type="button" className={s.kind} aria-pressed={kind === k} disabled={switching || busy} onClick={() => void switchKind(k)} data-testid={`kind-${k}`}>
                  {switching && kind !== k ? C.switching : C.kind[k]}
                </button>
              ))}
            </div>
            <div className={s.chooseHead}>
              <h1 className={s.question}>{C.chooseTitle}</h1>
              <p className={s.example}>{C.chooseLede(steps.length)}</p>
            </div>
            {switchError && (
              <p className={s.micError} role="alert">
                {switchError}
              </p>
            )}
            <TrustStrip kind={kind} onNavigate={guard(ROUTES.trust)} />
            <div className={s.choices}>
              <button type="button" className={`${g.glass} ${s.choice}`} onClick={() => start("voice")} disabled={!voiceOk || switching} data-testid="choose-voice">
                <span className={s.choiceIcon}>
                  <MicIcon />
                </span>
                <span className={s.choiceText}>
                  <strong>{C.voice.label}</strong>
                  <small>{voiceOk ? C.voice.hint : ONBOARDING.unsupported}</small>
                  {voiceOk && (
                    <small className={s.micNote} data-testid="mic-note">
                      {ONBOARDING.micNote}
                    </small>
                  )}
                </span>
              </button>
              <button type="button" className={`${g.glass} ${s.choice}`} onClick={() => start("text")} disabled={switching} data-testid="choose-text">
                <span className={s.choiceIcon}>
                  <PenIcon />
                </span>
                <span className={s.choiceText}>
                  <strong>{C.text.label}</strong>
                  <small>{C.text.hint}</small>
                </span>
              </button>
            </div>
            <div className={s.chooseLinks}>
              {hasPrevious && (
                <p className={s.resume} role={restart ? "alert" : undefined} data-testid="resume-note">
                  {restart ? C.restartWarning : C.resumeNote}{" "}
                  <button type="button" className={s.link} onClick={() => setRestart((r) => !r)} data-testid={restart ? "keep-profile" : "restart"}>
                    {restart ? C.keepProfile : C.restart}
                  </button>
                </p>
              )}
              <button type="button" className={s.link} onClick={() => setShowImport(true)} data-testid="import-open">
                {C.importLink}
              </button>
            </div>
          </section>
        )}

        {showImport && phase.at === "choose" && (
          <div className={l.sheetBackdrop} onClick={() => setShowImport(false)}>
            <div className={l.sheet} role="dialog" aria-modal="true" aria-label={C.importLink} onClick={(e) => e.stopPropagation()}>
              <header className={l.sheetHead}>
                <h2>{C.importLink}</h2>
                <button type="button" className={l.sheetClose} onClick={() => setShowImport(false)} aria-label={C.close}>
                  <Icon name="close" size={18} />
                </button>
              </header>
              <div className={l.sheetBody}>
                <ImportDossier kind={kind} profileId={profileId} onImported={onImported} bare />
              </div>
            </div>
          </div>
        )}

        {phase.at === "step" && (
          <section className={`${s.body} ${s.stepBody}`} key={`step-${phase.i}`}>
            {followUp ? (
              <h1 className={`${s.question} ${s.questionStep} ${s.questionLoaded}`} data-testid="follow-up">
                {followUp}
              </h1>
            ) : busy && phase.i > 0 ? (
              <div className={s.questionSkeleton} aria-busy="true" aria-label="Cargando pregunta…">
                <div className={s.skeletonLine} style={{ width: "85%" }} />
                <div className={s.skeletonLine} style={{ width: "60%" }} />
              </div>
            ) : (
              <h1 className={`${s.question} ${s.questionStep}`}>{steps[phase.i].question}</h1>
            )}
            <p className={s.example}>{steps[phase.i].example}</p>

            {mode === "voice" ? (
              <div className={s.voice}>
                <button
                  type="button"
                  className={s.orbBtn}
                  onClick={speech.listening ? speech.stop : speech.start}
                  aria-pressed={speech.listening}
                  aria-label={speech.listening ? C.tapToPause : speech.tapToResume ? C.tapToResume : C.tapToTalk}
                  data-testid="orb"
                >
                  <VoiceOrb active={speech.listening} pulse={pulse} size={132} />
                </button>
                <span className={s.orbLabel}>{speech.listening ? C.listening : speech.tapToResume ? C.tapToResume : C.tapToTalk}</span>
                {quietError && <p className={s.micError}>{quietError}</p>}
                <button type="button" className={s.switchBtn} onClick={toText} data-testid="prefer-text">
                  <PenIcon /> {C.preferText}
                </button>
              </div>
            ) : (
              <div className={s.textStep}>
                {micNotice && (
                  <p className={s.notice} role="status" data-testid="mic-notice">
                    {micNotice}
                  </p>
                )}
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
                {voiceOk && !blocked && (
                  <button type="button" className={s.switchBtn} onClick={toVoice} data-testid="prefer-voice">
                    <MicIcon /> {C.preferVoice}
                  </button>
                )}
              </div>
            )}

            <Transcript lines={lines} interim={mode === "voice" ? speech.interim : undefined} onRetry={(id) => queue.retry(id)} />
            {live}
          </section>
        )}

        {phase.at === "done" && (
          <section className={`${s.body} ${s.stepBody}`} key="done">
            <h1 className={`${s.question} ${s.questionStep}`}>{C.doneTitle[kind]}</h1>
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
            <dl className={`${g.glass} ${s.summary}`} data-testid="summary">
              {rows.map((r) => (
                <div key={r.field} className={s.row}>
                  <dt>{r.label}</dt>
                  <dd>{r.values.join(", ")}</dd>
                </div>
              ))}
              {rows.length === 0 && <p className={s.example}>{C.doneEmpty}</p>}
            </dl>
            {live}
            {kind === "business" && (
              <div className={s.importBox}>
                <MatchesPanel profileId={profile?.id ?? profileId} appUserId={app.appUserId || undefined} refreshKey={shownTurns.filter((t) => t.status === "done").length} knowsEnough={Boolean(profile?.sector && profile?.city)} />
              </div>
            )}
            <div className={s.ctas}>
              <Link className={`${g.btn} ${g.btnPrimary}`} href={kind === "creator" ? ROUTES.works : ROUTES.calls} onClick={guard(kind === "creator" ? ROUTES.works : ROUTES.calls)} aria-disabled={!!leaving || undefined} data-testid="finish-cta">
                {finishCopy.cta}
              </Link>
              <Link className={g.btn} href={ROUTES.calls} onClick={guard(ROUTES.calls)} aria-disabled={!!leaving || undefined} data-testid="calls-cta">
                {C.toCalls}
              </Link>
            </div>
          </section>
        )}

        <footer className={s.foot}>
          {leaving ? (
            <div className={`${g.glass} ${s.leaving}`} role="status" data-testid="leaving">
              {failed ? (
                <>
                  <span>{C.leaveFailed}</span>
                  <span className={s.leavingActions}>
                    <button type="button" className={s.link} onClick={() => queue.retry(failed.id)}>
                      {ONBOARDING.retry}
                    </button>
                    <Link href={leaving} className={s.link}>
                      {C.leaveAnyway}
                    </Link>
                  </span>
                </>
              ) : (
                <>
                  <span className={s.spinner} aria-hidden /> {C.saving}
                </>
              )}
            </div>
          ) : phase.at === "step" ? (
            <>
              <button type="button" className={`${g.btn} ${g.btnQuiet}`} onClick={() => go(phase.i - 1)}>
                {C.back}
              </button>
              <span className={`${s.status} ${s.grow}`} aria-live="polite">
                {queueStatus}
              </span>
              {photoButton}
              <button type="button" className={`${g.btn} ${g.btnPrimary}`} onClick={() => go(phase.i + 1)} data-testid="next">
                {phase.i + 1 === total ? C.finishStep : mode === "text" && !draft.trim() ? C.skip : C.next}
              </button>
            </>
          ) : phase.at === "done" ? (
            <>
              <button type="button" className={`${g.btn} ${g.btnQuiet}`} onClick={() => go(total - 1)}>
                {C.back}
              </button>
              {photoButton}
            </>
          ) : null}
        </footer>

        {/* what was noted, for screen readers: on screen the values fly into the live dossier instead (flyIn.ts) */}
        {noted && (
          <p key={noted.key} className={s.srOnly} role="status">
            {noted.text}
          </p>
        )}
        {photoOpen && <PhotoSheet profile={profile} profileId={profileId} onCreated={onWork} onClose={closePhoto} />}
      </div>
    </Stage>
  );
}
