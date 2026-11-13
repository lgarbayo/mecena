"use client";
/**
 * "Diseña tu dossier": the artist says or types how they want it and the design agent redraws the pages.
 * The three looks are only starting points; every request is applied on top of the current design.
 */
import { useState } from "react";
import { Button } from "@/components/ui";
import { useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { apiSend } from "@/lib/api-client";
import type { DossierDesign } from "../design";
import { DOSSIER_STYLES, STYLE_LABELS, type DossierStyle } from "../style";

export const DESIGN_API = "/api/dossier/design";

const EXAMPLES = ["Más oscuro, como una noche en el puerto", "Que parezca un fanzine", "Como un catálogo de museo", "La obra a sangre y más aire", "Usa los colores de mi obra"];

export interface DesignChange {
  design: DossierDesign;
  adjustments: string[];
}

export function DesignPanel(props: {
  design?: DossierDesign;
  suggested: DossierStyle;
  suggestedReason: string;
  forCall: boolean;
  workColors: string[];
  profileId: string;
  callId?: string;
  onChange: (c: DesignChange) => void;
  onUndo: () => Promise<void>;
}) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeechRecognition({ onFinal: (t) => setRequest((r) => (r ? `${r.trim()} ${t}` : t)) });

  async function send(body: { request?: string; preset?: DossierStyle }, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await apiSend<DesignChange>(DESIGN_API, { ...body, workColors: props.workColors, profileId: props.profileId, callId: props.callId });
      setAdjustments(res.adjustments);
      props.onChange(res);
      if (body.request) setRequest("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No he podido rediseñarlo. Prueba otra vez.");
    } finally {
      setBusy(null);
    }
  }

  const submit = () => {
    if (speech.listening) speech.stop();
    const text = request.trim();
    if (text) send({ request: text }, "agent");
  };

  return (
    <section className="design-panel no-print" aria-labelledby="design-panel-title">
      <div className="design-panel__head">
        <h2 id="design-panel-title">Diseña tu dossier</h2>
        {props.design ? (
          <p className="design-panel__current">
            Ahora: <strong>{props.design.name}</strong>
          </p>
        ) : null}
      </div>
      {props.design?.rationale ? <p className="design-panel__why">{props.design.rationale}</p> : null}
      {adjustments.length ? (
        <ul className="design-panel__adjust">
          {adjustments.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      ) : null}

      <form
        className="design-panel__ask"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="design-request" className="design-panel__label">
          Cuéntame cómo lo quieres, con tus palabras
        </label>
        <textarea
          id="design-request"
          rows={2}
          value={speech.listening && speech.interim ? `${request} ${speech.interim}`.trim() : request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Por ejemplo: más oscuro y con la letra de un libro antiguo, que la obra respire"
          disabled={!!busy}
        />
        <div className="design-panel__actions">
          <Button type="submit" disabled={!!busy || !request.trim()}>
            {busy === "agent" ? "Diseñando…" : "Rediseñar"}
          </Button>
          {speech.supported ? (
            <Button type="button" variant="ghost" onClick={() => (speech.listening ? speech.stop() : speech.start())} aria-pressed={speech.listening} disabled={!!busy}>
              {speech.listening ? "Parar de dictar" : "Dictar"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            disabled={!!busy}
            onClick={async () => {
              setBusy("undo");
              await props.onUndo().finally(() => setBusy(null));
              setAdjustments([]);
            }}
          >
            Deshacer
          </Button>
        </div>
        {error || speech.error ? (
          <p className="design-panel__error" role="alert">
            {error ?? speech.error}
          </p>
        ) : null}
      </form>

      <div className="design-panel__ideas" aria-label="Ideas">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="design-chip" disabled={!!busy} onClick={() => send({ request: ex }, "agent")}>
            {ex}
          </button>
        ))}
      </div>
      <p className="design-panel__start">
        O empieza desde{" "}
        {DOSSIER_STYLES.map((s, i) => (
          <span key={s}>
            <button type="button" className="design-link" disabled={!!busy} onClick={() => send({ preset: s }, s)}>
              {STYLE_LABELS[s]}
            </button>
            {s === props.suggested ? <span className="design-panel__tag"> (sugerido)</span> : null}
            {i < DOSSIER_STYLES.length - 2 ? ", " : i === DOSSIER_STYLES.length - 2 ? " o " : "."}
          </span>
        ))}{" "}
        {props.forCall ? "Para esta convocatoria" : "Para tu perfil"} sugerimos «{STYLE_LABELS[props.suggested]}» porque {props.suggestedReason}.
      </p>
    </section>
  );
}
