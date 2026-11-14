"use client";
/**
 * /dossier screen: loads GET /api/dossier, renders the editorial DossierDocument and the toolbar
 * (Descargar PDF, call variant notes, Pro gate, CTA to calls). The plain dossier and its PDF are always free;
 * the call-adapted variant is Pro (non-Pro users see the notes as a preview and the Paywall).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API, ROUTES, type Call, type Dossier, type Profile, type Work } from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";
import { Button, Spinner } from "@/components/ui";
import { Paywall } from "@/features/purchases/ui/Paywall";
import { apiGet, apiSend } from "@/lib/api-client";
import { isBlank, toDossierView, type VariantView } from "../model";
import { googleFontUrls, type DossierDesign } from "../design";
import { paletteFromPixels, suggestStyle } from "../style";
import { DESIGN_API, DesignPanel } from "./DesignPanel";
import { DossierDocument } from "./DossierDocument";
import { wantsHighResolution, wantsLooseImages } from "../images";
import "./screen.css";

interface DossierPayload {
  dossier: Dossier;
  profile: Profile;
  works: Work[];
  call?: Call;
  adapted: boolean;
  /** Works whose sheet is not confirmed yet (left out of the PDF). */
  unreviewed?: number;
}

export function dossierQuery(p: { profileId?: string; callId?: string; appUserId?: string }): string {
  const q = new URLSearchParams();
  if (p.profileId) q.set("profileId", p.profileId);
  if (p.callId) q.set("callId", p.callId);
  if (p.appUserId) q.set("appUserId", p.appUserId);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function DossierScreen() {
  const sp = useSearchParams();
  const { profile: active, appUserId } = useApp();
  const profileId = sp.get("profileId") || active?.id || undefined;
  const callId = sp.get("callId") || undefined;
  const [design, setDesign] = useState<DossierDesign | undefined>();
  const [designSaved, setDesignSaved] = useState<boolean | undefined>();
  const [autoDesigning, setAutoDesigning] = useState(false);
  const autoTried = useRef(false);
  const [workColors, setWorkColors] = useState<string[]>([]);
  const [data, setData] = useState<DossierPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<DossierPayload>(`${API.dossier}${dossierQuery({ profileId, callId, appUserId })}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el dossier");
    }
  }, [profileId, callId, appUserId]);

  useEffect(() => {
    if (callId && !appUserId) return; // wait for the app user id so the Pro check is right
    load();
  }, [load, callId, appUserId]);

  const view = useMemo(() => {
    if (!data) return null;
    const v = toDossierView({ profile: data.profile, dossier: data.dossier, works: data.works, call: data.call });
    // Without Pro the dossier keeps the plain order: no "Dossier para…" band on the cover.
    return data.adapted ? v : { ...v, variant: undefined };
  }, [data]);

  // The design on file (or the starting point that suits the call). Separate from the dossier data so a
  // redesign never reloads the content.
  const loadDesign = useCallback(async () => {
    const q = dossierQuery({ profileId, callId });
    const res = await apiGet<{ design: DossierDesign; saved: boolean }>(`${DESIGN_API}${q}`).catch(() => undefined);
    if (res) {
      setDesign(res.design);
      setDesignSaved(res.saved);
    }
  }, [profileId, callId]);
  useEffect(() => {
    loadDesign();
  }, [loadDesign]);

  // Colours of the artist's own photos, for the design agent: a few small samples, never a change to the work.
  const imageKey = data ? data.works.slice(0, 6).map((w) => w.imageUrl).join("|") : "";
  useEffect(() => {
    if (!imageKey) return;
    let cancelled = false;
    Promise.all(imageKey.split("|").map(samplePixels)).then((chunks) => {
      if (cancelled) return;
      const all = chunks.filter((c): c is Uint8ClampedArray => !!c);
      const merged = new Uint8ClampedArray(all.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of all) {
        merged.set(c, at);
        at += c.length;
      }
      setWorkColors(merged.length ? paletteFromPixels(merged, 3) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [imageKey]);

  // Nobody asks the artist how the dossier should look: the first design comes by itself, from the interview
  // and the colours of their work, as soon as there is something to design. Asking for changes is optional.
  const hasContent = !!data && (data.works.length > 0 || !!data.profile.statement || data.dossier.sections.length > 0);
  const coloursReady = !imageKey || workColors.length > 0;
  useEffect(() => {
    if (!data || designSaved !== false || !hasContent || autoTried.current) return;
    const go = () => {
      if (autoTried.current) return;
      autoTried.current = true;
      setAutoDesigning(true);
      apiSend<{ design: DossierDesign }>(DESIGN_API, { auto: true, workColors, profileId: data.profile.id, callId })
        .then((res) => {
          setDesign(res.design);
          setDesignSaved(true);
        })
        .catch(() => undefined)
        .finally(() => setAutoDesigning(false));
    };
    // Give the photos a moment to be sampled, but never wait on them for long.
    const t = setTimeout(go, coloursReady ? 0 : 2500);
    return () => clearTimeout(t);
  }, [data, designSaved, hasContent, coloursReady, workColors, callId]);

  const suggestion = data ? suggestStyle({ call: data.call, profile: data.profile }) : undefined;
  const fontUrls = design ? googleFontUrls(design) : [];

  // Progressive build: while sections are still pending (the user is talking), refresh quietly.
  const pending = view ? Object.values(view.states).some((s) => s !== "ready") : false;
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    return () => clearInterval(t);
  }, [pending, load]);

  if (error && !data) {
    return (
      <div className="card" role="alert">
        <p>{error}</p>
        <Button variant="ghost" onClick={load}>
          Reintentar
        </Button>
      </div>
    );
  }
  if (!data || !view) return <Spinner label={callId ? "Adaptando tu dossier a la convocatoria… (unos segundos)" : "Preparando tu dossier…"} />;

  const blank = isBlank(view);
  // The style note is already told by the design panel above; keep it for MCP and the PDF flow only.
  const notes = (data.dossier.variant?.notes ?? []).filter((n) => !n.startsWith("Estilo sugerido"));
  const pdfHref = `${API.dossierPdf}${dossierQuery({ profileId: data.profile.id, callId: data.adapted ? callId : undefined, appUserId })}`;
  const kindLabel = view.kind === "creator" ? "Dossier artístico" : "Memoria de empresa";
  const business = view.kind === "business";
  const unreviewed = data.unreviewed ?? 0;
  const looseImages = !!data.call && wantsLooseImages(data.call);
  const zipHref = `${API.dossierImages}${dossierQuery({ profileId: data.profile.id, callId })}`;

  return (
    <div className="dossier-screen">
      <header className="dossier-bar no-print">
        <div className="dossier-bar__title">
          <h1>{view.name || "Tu dossier"}</h1>
          <p className="dossier-bar__kicker">{kindLabel}</p>
        </div>
        <div className="dossier-bar__actions">
          <a className="btn btn-primary" href={pdfHref} target="_blank" rel="noopener" aria-disabled={blank} data-testid="dossier-pdf">
            Descargar PDF
          </a>
          <Link className="btn btn-ghost" href={ROUTES.calls}>
            Buscar convocatorias
          </Link>
        </div>
      </header>

      {looseImages && data.call ? (
        <aside className="dossier-loose no-print" role="note" data-testid="loose-images">
          <p className="dossier-loose__title">Esta convocatoria pide las imágenes sueltas, no un dossier en PDF.</p>
          <p>
            Las bases piden: {data.call.dossierRequirements?.format ?? "archivos de imagen"}
            {data.call.dossierRequirements?.maxImages ? ` · máx. ${data.call.dossierRequirements.maxImages} ${data.call.dossierRequirements.maxImages === 1 ? "imagen" : "imágenes"}` : ""}.
            Descarga aquí tus fotos tal como las subiste, sin recorte y sin tocar.
          </p>
          {data.works.length ? (
            <>
              <a className="btn btn-primary" href={zipHref} download data-testid="loose-zip">
                Descargar mis fotos (ZIP)
              </a>
              <ul className="dossier-loose__list">
                {data.works
                  .filter((w) => w.confirmed !== false)
                  .slice(0, data.call.dossierRequirements?.maxImages ?? undefined)
                  .map((w) => (
                    <li key={w.id}>
                      <a href={w.imageUrl} download>
                        {w.sheet.title || "Sin título"}
                      </a>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p>
              Aún no tienes fotos confirmadas. <Link href={ROUTES.works}>Súbelas en Obras</Link>.
            </p>
          )}
          {wantsHighResolution(data.call) ? (
            <p className="dossier-loose__warn">
              Ojo: piden alta resolución y Mecena guarda tus fotos a 1600 px para el dossier. Para presentarlas, usa los archivos originales de tu cámara o tu
              escáner.
            </p>
          ) : null}
        </aside>
      ) : null}

      {unreviewed > 0 ? (
        <p className="dossier-unreviewed no-print" role="status" data-testid="unreviewed">
          {unreviewed === 1 ? "1 obra sin revisar" : `${unreviewed} obras sin revisar`}: no {unreviewed === 1 ? "entra" : "entran"} en el PDF hasta que confirmes su ficha.{" "}
          <Link href={ROUTES.works}>Revisar en Obras</Link>
        </p>
      ) : null}

      {suggestion ? (
        <DesignPanel
          kind={view.kind}
          autoDesigning={autoDesigning}
          design={design}
          suggested={suggestion.style}
          suggestedReason={suggestion.reason}
          forCall={!!data.call}
          workColors={workColors}
          profileId={data.profile.id}
          callId={callId}
          onChange={(c) => setDesign(c.design)}
          onUndo={async () => {
            const res = await apiSend<{ design: DossierDesign }>(DESIGN_API, { undo: true, profileId: data.profile.id, callId }).catch(() => undefined);
            if (res) setDesign(res.design);
            autoTried.current = true; // undoing to the start must not trigger a new automatic design
          }}
        />
      ) : null}

      {callId && data.call ? (
        <aside className="dossier-variant no-print" aria-label="Adaptación a la convocatoria">
          <p className="dossier-variant__kicker">{data.adapted ? "Adaptado a la convocatoria" : "Vista previa de la adaptación · Pro"}</p>
          <p className="dossier-variant__call">{data.call.title.replace(/^\[FIXTURE\]\s*/, "")}</p>
          {notes.length ? (
            <ul className="dossier-variant__notes">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          {data.adapted && data.call.dossierRequirements?.maxFileMb !== undefined && !looseImages ? <PdfSizeLine href={pdfHref} /> : null}
          {data.adapted && view.variant ? <VariantPanel variant={view.variant} /> : null}
          {data.adapted ? null : (
            <>
              <p className="dossier-variant__lock">
                Debajo tienes tu dossier general, gratis. Con Pro lo reescribimos para esta convocatoria: en el orden y con los criterios que puntúa el tribunal, con tus
                propias palabras y marcando lo que falta. También en PDF.
              </p>
              <Button onClick={() => setPaywall(true)}>Adaptar mi dossier con Pro</Button>
            </>
          )}
        </aside>
      ) : null}

      {blank ? (
        business ? (
          <p className="dossier-empty no-print">
            Tu memoria de empresa se irá escribiendo mientras le cuentas a Mecena a qué os dedicáis. <Link href={ROUTES.onboarding}>Cuéntanos tu empresa</Link>.
          </p>
        ) : (
          <p className="dossier-empty no-print">
            Tu dossier se irá escribiendo mientras hablas con Mecena. <Link href={ROUTES.onboarding}>Empieza la entrevista</Link> o{" "}
            <Link href={ROUTES.works}>fotografía tus obras</Link>.
          </p>
        )
      ) : null}

      {fontUrls.map((href) => (
        // eslint-disable-next-line @next/next/no-page-custom-font -- fonts chosen at runtime by the design agent
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <DossierDocument view={view} progressive={blank} className="dossier-bleed" design={design} />

      <Paywall
        open={paywall}
        trigger="dossier_variant"
        onClose={() => setPaywall(false)}
        onPurchased={() => {
          setPaywall(false);
          load();
        }}
      />
    </div>
  );
}

/** The real size of the call version of the PDF against the call's limit (measured on the server). */
function PdfSizeLine({ href }: { href: string }) {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiGet<{ note?: string }>(`${href}${href.includes("?") ? "&" : "?"}info=1`)
      .then((r) => !cancelled && setNote(r.note ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [href]);
  return note ? (
    <p className="dossier-variant__size" data-testid="pdf-size">
      {note}
    </p>
  ) : (
    <p className="dossier-variant__size dossier-variant__crit">Midiendo el peso del PDF…</p>
  );
}

/** Reads a work image into a 48 px canvas and returns its RGBA pixels (same-origin images only). */
function samplePixels(url: string): Promise<Uint8ClampedArray | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(undefined);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(ctx.getImageData(0, 0, size, size).data);
      } catch {
        resolve(undefined); // tainted canvas or decode error: the agent just works without these colours
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}

const CHECK_LABEL = { ok: "Cumple", riesgo: "Revisa", no_aplica: "Lo aportas tú" } as const;

/** What the adaptation did and what the user can still add (screen only, never in the PDF). */
export function VariantPanel({ variant }: { variant: VariantView }) {
  if (!variant.sections.length) return null;
  return (
    <div className="dossier-variant__body" data-testid="variant-panel">
      {variant.strategy ? <p className="dossier-variant__strategy">{variant.strategy}</p> : null}
      {variant.unsupportedNumbers.length ? (
        <p className="dossier-variant__warn" role="alert">
          Revisa estas cifras: no salen de lo que nos has contado ni de las bases ({variant.unsupportedNumbers.join(", ")}).
        </p>
      ) : null}
      {variant.questions.length ? (
        <details open>
          <summary>Para sumar puntos, cuéntanos ({variant.questions.length})</summary>
          <ol className="dossier-variant__list">
            {variant.questions.map((q, i) => (
              <li key={i}>
                {q.question}
                {q.criterion ? <span className="dossier-variant__crit"> · {q.criterion}</span> : null}
              </li>
            ))}
          </ol>
          <Link className="btn btn-ghost" href={ROUTES.onboarding}>
            Responder hablando
          </Link>
        </details>
      ) : null}
      {variant.formatChecks.length ? (
        <details>
          <summary>Requisitos de formato y documentos ({variant.formatChecks.length})</summary>
          <ul className="dossier-variant__list">
            {variant.formatChecks.map((c, i) => (
              <li key={i} data-status={c.status}>
                <strong>{CHECK_LABEL[c.status]}</strong> · {c.rule}
                {c.note ? <span className="dossier-variant__crit"> · {c.note}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {variant.omitted.length ? (
        <details>
          <summary>Lo que hemos dejado fuera ({variant.omitted.length})</summary>
          <ul className="dossier-variant__list">
            {variant.omitted.map((o, i) => (
              <li key={i}>
                <strong>{o.what}</strong>: {o.why}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="dossier-variant__crit">
        {variant.generatedBy === "ai" ? "Reescrito con IA a partir de tus palabras." : "Adaptación automática sin IA."} Tú tienes la última palabra: revisa cada texto antes
        de presentarlo.
      </p>
    </div>
  );
}
