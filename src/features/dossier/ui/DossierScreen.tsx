"use client";
/**
 * /dossier screen: loads GET /api/dossier, renders the editorial DossierDocument and the toolbar
 * (Descargar PDF, call variant notes, Pro gate, CTA to calls). The plain dossier and its PDF are always free;
 * the call-adapted variant is Pro (non-Pro users see the notes as a preview and the Paywall).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { API, ROUTES, type Call, type Dossier, type Profile, type Work } from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";
import { Button, Spinner } from "@/components/ui";
import { Paywall } from "@/features/purchases/ui/Paywall";
import { apiGet } from "@/lib/api-client";
import { isBlank, toDossierView } from "../model";
import { DossierDocument } from "./DossierDocument";
import "./screen.css";

interface DossierPayload {
  dossier: Dossier;
  profile: Profile;
  works: Work[];
  call?: Call;
  adapted: boolean;
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
  if (!data || !view) return <Spinner label="Preparando tu dossier…" />;

  const blank = isBlank(view);
  const notes = data.dossier.variant?.notes ?? [];
  const pdfHref = `${API.dossierPdf}${dossierQuery({ profileId: data.profile.id, callId: data.adapted ? callId : undefined, appUserId })}`;
  const kindLabel = view.kind === "creator" ? "Dossier artístico" : "Dossier de empresa";

  return (
    <div className="dossier-screen">
      <header className="dossier-bar no-print">
        <div className="dossier-bar__title">
          <p className="dossier-bar__kicker">{kindLabel}</p>
          <h1>{view.name || "Tu dossier"}</h1>
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
          {data.adapted ? null : (
            <>
              <p className="dossier-variant__lock">Debajo tienes tu dossier general, gratis. Con Pro lo reordenamos y ajustamos para esta convocatoria, también en PDF.</p>
              <Button onClick={() => setPaywall(true)}>Adaptar mi dossier con Pro</Button>
            </>
          )}
        </aside>
      ) : null}

      {blank ? (
        <p className="dossier-empty no-print">
          Tu dossier se irá escribiendo mientras hablas con Mecena. <Link href={ROUTES.onboarding}>Empieza la entrevista</Link> o <Link href={ROUTES.works}>fotografía tus obras</Link>.
        </p>
      ) : null}

      <DossierDocument view={view} progressive={blank} className="dossier-bleed" />

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
