"use client";
/**
 * "Maquetación libre": the model composes the dossier page by page (no templates). The artist gets a batch of
 * proposals, each with its own art direction, picks one, and keeps asking for changes in plain language
 * (history and undo). Generating takes a minute or two: the server runs it in the background and this panel polls.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { apiGet, apiSend } from "@/lib/api-client";
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

const THUMB_CSS = `
  .layout-proposals { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  .layout-proposal { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid currentColor; border-color: color-mix(in srgb, currentColor 22%, transparent); border-radius: 10px; }
  .layout-proposal h3 { margin: 0; font-size: 1rem; }
  .layout-proposal p { margin: 0; font-size: 0.88rem; line-height: 1.45; opacity: 0.85; }
  .layout-busy { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 0.95rem; }
  .layout-busy::before { content: ""; width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: layout-spin 0.9s linear infinite; }
  @keyframes layout-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .layout-busy::before { animation: none; } }
`;

export function LayoutPanel(props: { profileId: string; callId?: string; state: LayoutClientState | undefined; onState: (s: LayoutClientState) => void }) {
  const { state, onState, profileId, callId } = props;
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const speech = useSpeechRecognition({ onFinal: (t) => setRequest((r) => (r ? `${r.trim()} ${t}` : t)) });
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

  async function send(payload: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    try {
      const res = await apiSend<LayoutClientState>(LAYOUT_API, { ...payload, profileId, callId });
      onState(res);
      if (payload.request) setRequest("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No he podido maquetarlo. Prueba otra vez.");
    } finally {
      setBusy(null);
    }
  }
  const submit = () => {
    if (speech.listening) speech.stop();
    if (request.trim() && !working) send({ request: request.trim() }, "ask");
  };

  if (!state) return null; // not read yet: no flash of the wrong panel
  if (!state.enabled) {
    return (
      <section className="design-panel no-print" aria-labelledby="layout-panel-title">
        <div className="design-panel__head">
          <h2 id="layout-panel-title">Maquetación libre</h2>
        </div>
        <p className="design-panel__why">¿Quieres un dossier que no se parezca a ningún otro? Con la maquetación libre te propongo varias composiciones distintas, páginas hechas a partir de tu obra y de tus palabras, y tú eliges y me pides cambios.</p>
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
      <style>{THUMB_CSS}</style>
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
          Estoy componiendo {count} maquetaciones distintas a partir de tu obra. Tarda uno o dos minutos; no hace falta que te quedes mirando.
        </p>
      ) : null}
      {changing ? (
        <p className="layout-busy" role="status">
          Aplicando tu cambio…
        </p>
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
            ? "Estas son las propuestas. Cada una sigue una dirección de arte distinta: elige la que más te guste y luego te dejo cambiarle lo que quieras."
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
      {chosen && state.adjustments.length ? (
        <div className="design-panel__actions">
          <Button
            type="button"
            variant="ghost"
            disabled={working}
            onClick={() => send({ request: `Ajusta la maquetación a mis textos actuales: ${state.adjustments.join(" ")}` }, "ask")}
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
            value={speech.listening && speech.interim ? `${request} ${speech.interim}`.trim() : request}
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
            <Button type="submit" disabled={working || !request.trim()}>
              {busy === "ask" || changing ? "Maquetando…" : "Cambiar"}
            </Button>
            {speech.supported ? (
              <Button type="button" variant="ghost" onClick={() => (speech.listening ? speech.stop() : speech.start())} aria-pressed={speech.listening} disabled={working}>
                {speech.listening ? "Parar de dictar" : "Dictar"}
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
