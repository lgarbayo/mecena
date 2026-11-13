"use client";
/**
 * /onboarding: talk (Web Speech es-ES) or type; every final chunk becomes a queued turn
 * (POST /api/onboarding/turn, strictly sequential) and the profile + dossier update live beside the transcript.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { API, ROUTES, type DossierSection, type Profile, type ProfileKind, type TranscriptSegment } from "@/contracts";
import type { OnboardingTurnResponse } from "@/contracts/api";
import { useApp } from "@/components/shell/AppProvider";
import { useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { apiGet, apiSend } from "@/lib/api-client";
import { FIELD_LABELS, ONBOARDING } from "../copy";
import { TurnQueue, type QueuedTurn } from "../turnQueue";
import { DossierPanel } from "./DossierPanel";
import { MicIcon, PauseIcon } from "./icons";
import { ProfilePanel } from "./ProfilePanel";
import { TrustStrip } from "./TrustStrip";
import s from "./onboarding.module.css";

/** GET state endpoint owned by WP-01 (see contract change request: API.onboardingState). */
export const ONBOARDING_STATE_API = "/api/onboarding";
const FLASH_MS = 2600;

interface State {
  profile: Profile;
  sections: DossierSection[];
  transcript: TranscriptSegment[];
}

export function OnboardingClient() {
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [sections, setSections] = useState<DossierSection[]>([]);
  const [history, setHistory] = useState<TranscriptSegment[]>([]);
  const [turns, setTurns] = useState<QueuedTurn[]>([]);
  const [followUp, setFollowUp] = useState<string | undefined>();
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());
  const [changedSections, setChangedSections] = useState<Set<string>>(new Set());
  const [noted, setNoted] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [checked, setChecked] = useState(false);
  const [everListened, setEverListened] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finishRef = useRef<HTMLDivElement>(null);

  const kind: ProfileKind = profile?.kind ?? app.profile?.kind ?? "creator";
  const profileId = app.profile?.id;

  // Load (and reload on mode switch) the persisted state so a refresh never loses the conversation.
  useEffect(() => {
    let alive = true;
    const url = profileId ? `${ONBOARDING_STATE_API}?profileId=${encodeURIComponent(profileId)}` : ONBOARDING_STATE_API;
    apiGet<State>(url)
      .then((st) => {
        if (!alive) return;
        setProfile(st.profile);
        setSections(st.sections);
        setHistory(st.transcript);
        setTurns([]);
        setFollowUp(undefined);
        setLoadError(null);
      })
      .catch(() => alive && setLoadError(ONBOARDING.failed));
    return () => {
      alive = false;
    };
  }, [profileId]);

  const onResult = useCallback((res: OnboardingTurnResponse) => {
    setProfile(res.profile);
    setSections(res.sections);
    if (res.followUpQuestion) setFollowUp(res.followUpQuestion);
    setChangedFields(new Set(res.changedProfileFields));
    setChangedSections(new Set(res.changedSectionKeys));
    setNoted(res.changedProfileFields.map((f) => FIELD_LABELS[f]).filter(Boolean));
    setVersion((v) => v + 1);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setChangedFields(new Set());
      setChangedSections(new Set());
      setNoted([]);
    }, FLASH_MS);
    if (res.changedProfileFields.length) appRef.current.refresh().catch(() => undefined);
  }, []);

  const pidRef = useRef(profileId);
  pidRef.current = profileId;
  const queue = useMemo(
    () =>
      new TurnQueue((t) => apiSend<OnboardingTurnResponse>(API.onboardingTurn, { ...t, profileId: pidRef.current }), {
        change: setTurns,
        result: onResult,
      }),
    [onResult],
  );
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const speech = useSpeechRecognition({ onFinal: (text) => queue.enqueue(text, "voice") });
  useEffect(() => setChecked(true), []);
  useEffect(() => {
    if (speech.listening) setEverListened(true);
  }, [speech.listening]);

  const submitText = (e?: FormEvent) => {
    e?.preventDefault();
    if (queue.enqueue(draft, "text")) setDraft("");
  };

  const finish = () => {
    speech.stop();
    finishRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const micError = speech.error && !/no-speech|aborted/.test(speech.error) ? (/micr[oó]fono/i.test(speech.error) ? ONBOARDING.micDenied : speech.error) : null;
  const pendingTurns = turns;
  const busy = turns.some((t) => t.status === "sending" || t.status === "queued");
  const hasContent = history.length > 0 || turns.some((t) => t.status === "done");
  const hints = ONBOARDING.hints[kind];
  const lastSaid = speech.interim || [...turns].reverse().find((t) => t.source === "voice")?.text || "";

  return (
    <div className={s.page}>
      <header className={s.intro}>
        <p className="kicker">{ONBOARDING.kicker[kind]}</p>
        <h1>{ONBOARDING.title[kind]}</h1>
        <p className={s.lede}>{ONBOARDING.subtitle[kind]}</p>
      </header>

      <TrustStrip />

      <section className={s.controls} aria-label="Habla o escribe">
        {checked && speech.supported ? (
          <>
            <div className={s.micRow}>
              <button
                type="button"
                className={`${s.mic} ${speech.listening ? s.micOn : ""}`}
                onClick={speech.listening ? speech.stop : speech.start}
                aria-pressed={speech.listening}
                data-testid="mic-button"
              >
                {speech.listening ? <PauseIcon /> : <MicIcon />}
                <span className={s.srOnly}>{speech.listening ? ONBOARDING.pause : everListened ? ONBOARDING.resume : ONBOARDING.record}</span>
              </button>
              <div className={s.micText}>
                <strong>{speech.listening ? ONBOARDING.listening : everListened ? ONBOARDING.resume : ONBOARDING.record}</strong>
                {!everListened && <small>{ONBOARDING.micNote}</small>}
                {speech.listening && <small className={s.interim}>{speech.interim || " "}</small>}
              </div>
              {hasContent && (
                <button type="button" className="btn btn-ghost" onClick={finish}>
                  {ONBOARDING.done}
                </button>
              )}
            </div>
            {micError && (
              <p className={s.error} role="alert">
                {micError}
              </p>
            )}
          </>
        ) : (
          checked && <p className={s.note}>{ONBOARDING.unsupported}</p>
        )}
        <form className={s.textForm} onSubmit={submitText}>
          <label htmlFor="onb-text" className={s.textLabel}>
            {speech.supported ? ONBOARDING.writeToggle : ONBOARDING.transcriptPanel}
          </label>
          <textarea
            id="onb-text"
            value={draft}
            rows={2}
            placeholder={ONBOARDING.textPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitText();
              }
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
            {ONBOARDING.send}
          </button>
        </form>
        <ul className={s.hints} aria-label="Qué contar">
          {hints.map((h) => {
            const done = !!profile && h.fields.some((f) => {
              const v = (profile as Record<string, unknown>)[f];
              return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "" && v !== null;
            });
            return (
              <li key={h.label} className={done ? s.hintDone : ""}>
                {h.label}
              </li>
            );
          })}
        </ul>
      </section>

      {followUp && (
        <p className={s.followUp} aria-live="polite" key={followUp}>
          <span className={s.followKicker}>{ONBOARDING.followUpKicker}</span>
          {followUp}
        </p>
      )}

      {loadError && (
        <p className={s.error} role="alert">
          {loadError}
        </p>
      )}

      <div className={s.live}>
        <ProfilePanel kind={kind} profile={profile} changed={changedFields} version={version} />
        <DossierPanel kind={kind} sections={sections} changed={changedSections} version={version} />
      </div>

      <section className={s.panel} aria-labelledby="transcript-title">
        <header className={s.panelHead}>
          <h2 id="transcript-title">{ONBOARDING.transcriptPanel}</h2>
          {busy && <span className={s.sending}>{ONBOARDING.sending}</span>}
        </header>
        {history.length === 0 && pendingTurns.length === 0 && !speech.interim && <p className={s.muted}>{ONBOARDING.transcriptEmpty}</p>}
        <ol className={s.transcript} data-testid="transcript">
          {history.map((h) => (
            <li key={h.id}>{h.text}</li>
          ))}
          {pendingTurns.map((t) => (
            <li key={t.id} className={t.status === "failed" ? s.turnFailed : t.status === "done" ? "" : s.turnPending} data-status={t.status}>
              {t.text}
              {t.status === "failed" && (
                <span className={s.retryRow}>
                  <span>{ONBOARDING.failed}</span>
                  <button type="button" className="btn btn-quiet" onClick={() => queue.retry(t.id)}>
                    {ONBOARDING.retry}
                  </button>
                </span>
              )}
            </li>
          ))}
          {speech.interim && <li className={s.interimLine}>{speech.interim}</li>}
        </ol>
      </section>

      {hasContent && (
        <div ref={finishRef} className={s.finish}>
          <h2>{ONBOARDING.finish[kind].title}</h2>
          <p>{ONBOARDING.finish[kind].body}</p>
          <Link className="btn btn-primary" href={kind === "creator" ? ROUTES.works : ROUTES.dossier} data-testid="finish-cta">
            {ONBOARDING.finish[kind].cta}
          </Link>
        </div>
      )}

      {/* While talking, keep the mic and the words in reach even when scrolled down to the dossier. */}
      {speech.listening && (
        <div className={s.liveBar} role="status">
          <span className={s.dot} aria-hidden />
          <span className={s.liveText}>{lastSaid || ONBOARDING.listening}</span>
          <button type="button" className={s.liveStop} onClick={speech.stop} aria-label={ONBOARDING.pause}>
            <PauseIcon size={20} />
          </button>
        </div>
      )}
      {noted.length > 0 && (
        <p className={s.toast} role="status">
          {ONBOARDING.noted(noted.join(", "))}
        </p>
      )}
    </div>
  );
}
