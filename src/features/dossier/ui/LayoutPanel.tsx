"use client";
/**
 * "Maquetación libre": the model composes the dossier page by page (no templates). It is the first design: the first
 * batch starts by itself (end of the interview or opening the dossier, from how the artist imagines it). The artist gets a batch of
 * proposals, each with its own art direction, picks one, and keeps asking for changes in plain language
 * (history and undo). Generating takes a minute or two: the server runs it in the background and this panel polls.
 */
import { useEffect, useState } from "react";
import { Button, LoadingRegion, Skeleton, SkeletonText } from "@/components/ui";
import { useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { apiGet, apiSend } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { textsOutgrewLayout } from "../layout/notes";
import type { LayoutState } from "../layout/service";
import { FreeLayoutThumb, layoutFontUrls } from "./FreeLayoutDocument";

export const LAYOUT_API = "/api/dossier/layout";
export type LayoutClientState = LayoutState;

const EXAMPLES = [
  "Foto grande a toda página y debajo solo una cita",
  "Solo texto enorme",
  "Fondo negro sobrio",
  "Más aire",
  "Pon la obra 2 a toda página",
  "Texto en dos columnas",
];

/** A paper-shaped placeholder (A-series sheet) for a page the agent is still composing. */
export function PaperSkeleton({ className }: { className?: string }) {
  return (
    <div className={`paper-skel${className ? ` ${className}` : ""}`} aria-hidden="true">
      <Skeleton width="38%" height={10} radius={999} />
      <Skeleton className="paper-skel__media" width="100%" radius={8} />
      <SkeletonText lines={3} />
    </div>
  );
}

/** A batch of proposals on its way: one paper-shaped card per proposal. */
function ProposalSkeletons({ count, label }: { count: number; label: string }) {
  return (
    <LoadingRegion label={label}>
      <div className="layout-proposals" data-testid="layout-skeleton">
        {Array.from({ length: Math.max(1, Math.min(count, 4)) }, (_, i) => (
          <div key={i} className="layout-proposal layout-proposal--skeleton">
            <PaperSkeleton />
            <Skeleton width="55%" height={22} radius={6} />
            <SkeletonText lines={2} />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function LayoutPanel(props: { profileId: string; callId?: string; state: LayoutClientState | undefined; onState: (s: LayoutClientState) => void }) {
  const { state, onState, profileId, callId } = props;
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeechRecognition({
    onFinal: (t) => setRequest((r) => (r ? `${r.trim()} ${t}` : t)),
  });
  const working = !!busy || !!state?.busy;

  // A job runs in the background on the server: poll until it is idle.
  const serverBusy = !!state?.busy;
  useEffect(() => {
    if (!serverBusy) return;
    const q = new URLSearchParams({ profileId, ...(callId ? { callId } : {}) });
    const t = setInterval(() => {
      apiGet<LayoutClientState>(`${LAYOUT_API}?${q}`)
        .then(onState)
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
  }, [serverBusy, profileId, callId, onState]);

  // Every mutation carries an Idempotency-Key: a double tap is ignored while pending, a retry after a failure
  // reuses the same key (the server answers once), and a fresh key goes with the next change.
  const action = useAction(async (idempotencyKey: string, payload: Record<string, unknown>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const res = await apiSend<LayoutClientState>(LAYOUT_API, { ...payload, profileId, callId }, "POST", undefined, { idempotencyKey });
      onState(res);
      if (payload.request) setRequest("");
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No he podido maquetarlo. Prueba otra vez.");
      throw e;
    } finally {
      setBusy(null);
    }
  });
  const send = (payload: Record<string, unknown>, label: string) => {
    if (action.pending) return;
    void action.run(payload, label).catch(() => undefined);
  };
  const fullRequest = speech.listening && speech.interim ? `${request} ${speech.interim}`.trim() : request;

  const submit = () => {
    const text = fullRequest.trim();
    if (speech.listening) speech.stop();
    if (text && !working) send({ request: text }, "ask");
  };

  if (!state) return null; // not read yet: no flash of the wrong panel
  if (!state.enabled) {
    return (
      <section className="design-panel no-print" aria-labelledby="layout-panel-title">
        <div className="design-panel__head">
          <h2 id="layout-panel-title">Maquetación libre</h2>
        </div>
        <p className="design-panel__why">
          ¿Quieres un dossier que no se parezca a ningún otro? Con la maquetación libre te propongo varias composiciones distintas, páginas hechas a partir de tu obra y
          de tus palabras, y tú eliges y me pides cambios.
        </p>
        <div className="design-panel__actions">
          <Button type="button" variant="ghost" disabled={working} onClick={() => send({ enabled: true }, "on")} data-testid="free-layout-on">
            {busy === "on" ? "Activando…" : "Activar maquetación libre"}
          </Button>
        </div>
        {error ? (
          <p className="design-panel__error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const count = state.count;
  const chosen = state.mode === "libre";
  const proposals = state.proposals;
  const fontUrls = layoutFontUrls([...proposals.map((p) => p.prepared), ...(state.prepared ? [state.prepared] : [])]);
  const out = state.outcome;
  const generating = state.busy && state.busyKind === "batch";
  const changing = state.busy && state.busyKind === "change";

  const proposalList = proposals.length ? (
    <div className="layout-proposals" data-testid="layout-proposals">
      {proposals.map((p) => (
        <article key={p.id} className="layout-proposal">
          <FreeLayoutThumb layout={p.prepared} />
          <h3>{p.name}</h3>
          <p>{p.rationale || p.direction}</p>
          <Button type="button" variant="ghost" disabled={working} onClick={() => send({ choose: p.id }, "choose")} data-testid="layout-choose">
            {chosen && state.name === p.name ? "Elegida" : "Elegir esta"}
          </Button>
        </article>
      ))}
    </div>
  ) : null;

  return (
    <section className="design-panel no-print" aria-labelledby="layout-panel-title" data-testid="layout-panel">
      {fontUrls.map((href) => (
        // eslint-disable-next-line @next/next/no-page-custom-font -- faces chosen at runtime by the layout model
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <div className="design-panel__head">
        <h2 id="layout-panel-title">Maquetación libre</h2>
        {chosen && state.name ? (
          <p className="design-panel__current">
            Ahora: <strong>{state.name}</strong>
          </p>
        ) : null}
      </div>

      {generating ? (
        <p className="layout-busy" role="status" data-testid="layout-generating">
          Estoy componiendo {count} maquetaciones distintas a partir de tu obra
          {state.wish ? " y de cómo te imaginas tu dossier" : ""}. Tarda uno o dos minutos; no hace falta que te quedes mirando.
        </p>
      ) : null}
      {generating ? <ProposalSkeletons count={count} label="Componiendo maquetaciones…" /> : null}
      {changing ? (
        <LoadingRegion label="Aplicando tu cambio…" className="layout-changing">
          <p className="layout-busy">Aplicando tu cambio…</p>
          <div className="layout-proposals">
            <PaperSkeleton />
          </div>
        </LoadingRegion>
      ) : null}
      {state.notice ? (
        <p className="design-panel__error" role="status" data-testid="layout-notice">
          {state.notice}
        </p>
      ) : null}
      {!state.busy && out?.notice && out.notice !== state.notice ? (
        <p className="design-panel__error" role="status" data-testid="layout-outcome">
          {out.notice}
        </p>
      ) : null}

      {!chosen && !generating ? (
        <p className="design-panel__why">
          {proposals.length
            ? `Estas son las propuestas${state.wish ? ", a partir de cómo te imaginas tu dossier" : ""}. Cada una sigue una dirección de arte distinta: elige la que más te guste y luego te dejo cambiarle lo que quieras.`
            : `Pulsa y te propongo ${count} maquetaciones muy distintas de tu dossier. Hasta que elijas una, ves el diseño de plantilla de siempre.`}
        </p>
      ) : null}

      {chosen && state.rationale ? <p className="design-panel__why">{state.rationale}</p> : null}
      {chosen && state.adjustments.length ? (
        <ul className="design-panel__adjust">
          {state.adjustments.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      ) : null}
      {chosen && textsOutgrewLayout(state.adjustments) ? (
        <div className="design-panel__actions">
          <Button
            type="button"
            variant="ghost"
            disabled={working}
            onClick={() =>
              send(
                {
                  request: `Ajusta la maquetación a mis textos actuales: ${state.adjustments.join(" ")}`,
                },
                "ask",
              )
            }
            data-testid="layout-refit"
          >
            Ajustar la maquetación a mis textos
          </Button>
        </div>
      ) : null}

      {!chosen ? proposalList : null}

      {chosen ? (
        <form
          className="design-panel__ask"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="layout-request" className="design-panel__label">
            Dime qué quieres cambiar de esta maquetación
          </label>
          <textarea
            id="layout-request"
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
            placeholder="Por ejemplo: foto grande a toda página y debajo solo una cita"
            disabled={working}
          />
          <div className="design-panel__actions">
            <Button type="submit" disabled={working || !fullRequest.trim()}>
              {busy === "ask" || changing ? "Maquetando…" : "Cambiar"}
            </Button>
            {speech.supported ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => (speech.listening ? speech.stop() : speech.start())}
                aria-pressed={speech.listening}
                disabled={working}
              >
                {speech.listening ? "Parar de dictar" : speech.tapToResume ? "Seguir dictando" : "Dictar"}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" disabled={working || !state.canUndo} onClick={() => send({ undo: true }, "undo")}>
              Deshacer
            </Button>
          </div>
        </form>
      ) : null}

      {chosen ? (
        <div className="design-panel__ideas" aria-label="Ideas">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="design-chip" disabled={working} onClick={() => send({ request: ex }, "ask")}>
              {ex}
            </button>
          ))}
        </div>
      ) : null}

      {chosen && proposals.length ? (
        <details>
          <summary>Otras propuestas de la tanda</summary>
          {proposalList}
        </details>
      ) : null}

      <div className="design-panel__actions">
        <Button type="button" disabled={working || state.batchesLeft <= 0} onClick={() => send({ generate: true }, "generate")} data-testid="layout-generate">
          {busy === "generate" || generating ? "Componiendo…" : proposals.length || chosen ? `Otras ${count}` : `Proponme ${count} maquetaciones`}
        </Button>
        <Button type="button" variant="ghost" disabled={working} onClick={() => send({ enabled: false }, "off")}>
          Volver a las plantillas
        </Button>
      </div>
      {state.batchesLeft <= 0 ? <p className="design-panel__why">Hoy ya has pedido todas las tandas que puedo hacerte. Quédate con una o sigue mañana.</p> : null}
      {error || speech.error ? (
        <p className="design-panel__error" role="alert">
          {error ?? speech.error}
        </p>
      ) : null}
    </section>
  );
}
