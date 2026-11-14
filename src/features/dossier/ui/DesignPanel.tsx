"use client";
/**
 * "Diseña tu dossier": the artist says or types how they want it and the design agent redraws the pages.
 * The three looks are only starting points; every request is applied on top of the current design.
 */
import { useState } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { apiSend } from "@/lib/api-client";
import type { ProfileKind } from "@/contracts";
import type { DossierDesign } from "../design";
import { DOSSIER_STYLES, STYLE_LABELS, type DossierStyle } from "../style";

export const DESIGN_API = "/api/dossier/design";

/** Things to ask for, by profile: an artist talks about their work; a company about its brand and projects. */
const EXAMPLES_BY_KIND: Record<ProfileKind, string[]> = {
  creator: ["Más oscuro, como una noche en el puerto", "Que parezca un fanzine", "La obra a sangre y más aire", "Algo breve, de una página", "Añade una sección sobre mi proceso", "Empieza por la obra y deja la biografía fuera"],
  business: ["Más sobrio y moderno", "Con el azul de nuestra marca", "Más claro y luminoso", "Algo breve, de una página", "Añade una sección sobre nuestros clientes"],
};

export interface DesignChange {
  design: DossierDesign;
  adjustments: string[];
}

export function DesignPanel(props: {
  /** Profile kind: business gets company wording and examples. Default creator. */
  kind?: ProfileKind;
  design?: DossierDesign;
  autoDesigning?: boolean;
  suggested: DossierStyle;
  suggestedReason: string;
  forCall: boolean;
  workColors: string[];
  profileId: string;
  callId?: string;
  onChange: (c: DesignChange) => void;
  onUndo: () => Promise<void>;
}) {
  const business = props.kind === "business";
  const examples = EXAMPLES_BY_KIND[props.kind ?? "creator"];
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

  const fullRequest = speech.listening && speech.interim ? `${request} ${speech.interim}`.trim() : request;

  const submit = () => {
    const text = fullRequest.trim();
    if (speech.listening) speech.stop();
    if (text) send({ request: text }, "agent");
  };

  return (
    <section className="design-panel no-print" aria-labelledby="design-panel-title">
      <div className="design-panel__head">
        <h2 id="design-panel-title">{business ? "Diseña tu memoria" : "Diseña tu dossier"}</h2>
        {props.design ? (
          <p className="design-panel__current">
            Ahora: <strong>{props.design.name}</strong>
          </p>
        ) : null}
      </div>
      {props.autoDesigning ? (
        <p className="design-panel__why" role="status">
          {business
            ? "Estoy preparando tu diseño a partir de lo que me has contado de tu empresa…"
            : "Estoy preparando tu diseño a partir de lo que me has contado y de los colores de tus obras…"}
        </p>
      ) : props.design?.rationale ? (
        <p className="design-panel__why">{props.design.rationale}</p>
      ) : null}
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
          Pide un cambio
        </label>
        <textarea
          id="design-request"
          rows={2}
          value={fullRequest}
          readOnly={speech.listening}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            business
              ? "Ej.: más sobrio, con el azul de nuestra marca"
              : "Ej.: más oscuro, que empiece por mis piezas"
          }
          disabled={!!busy || props.autoDesigning}
        />
        <div className="design-panel__actions">
          <Button type="submit" disabled={!!busy || !fullRequest.trim()}>
            {busy === "agent" ? "Diseñando…" : "Rediseñar"}
          </Button>
          {speech.supported ? (
            <Button
              type="button"
              variant="ghost"
              className="design-panel__icon"
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              aria-pressed={speech.listening}
              aria-label={speech.listening ? "Parar de dictar" : speech.tapToResume ? "Toca para seguir dictando" : "Dictar"}
              title={speech.listening ? "Parar de dictar" : speech.tapToResume ? "Toca para seguir dictando" : "Dictar"}
              disabled={!!busy}
            >
              <Icon name={speech.listening ? "stop" : "mic"} />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="design-panel__icon"
            aria-label="Deshacer"
            title="Deshacer"
            disabled={!!busy}
            onClick={async () => {
              setBusy("undo");
              await props.onUndo().finally(() => setBusy(null));
              setAdjustments([]);
            }}
          >
            <Icon name="undo" />
          </Button>
        </div>
        {error || speech.error ? (
          <p className="design-panel__error" role="alert">
            {error ?? speech.error}
          </p>
        ) : speech.tapToResume ? (
          <p className="design-panel__why" role="status">
            Toca el micrófono para seguir dictando.
          </p>
        ) : null}
      </form>

      <div className="design-panel__ideas" aria-label="Ideas">
        {examples.map((ex) => (
          <button key={ex} type="button" className="design-chip" disabled={!!busy} onClick={() => send({ request: ex }, "agent")}>
            {ex}
          </button>
        ))}
      </div>
      <div className="design-panel__start">
        <span className="design-panel__label">Estilos base</span>
        <div className="design-panel__ideas">
          {DOSSIER_STYLES.map((st) => (
            <button
              key={st}
              type="button"
              className={`design-chip${st === props.suggested ? " design-chip--suggested" : ""}`}
              disabled={!!busy}
              onClick={() => send({ preset: st }, st)}
              title={st === props.suggested ? `Sugerido ${props.forCall ? "para esta convocatoria" : "para tu perfil"}: ${props.suggestedReason}` : undefined}
            >
              {STYLE_LABELS[st]}
              {st === props.suggested ? <span className="design-panel__tag">Sugerido</span> : null}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
