"use client";
// IDEA #7 /justificacion/[applicationId]: photograph an invoice -> it is read and assigned to a budget line -> deviation
// alerts -> final memoria drafted from the user's words and the numbers. Mecena prepares; the user presents.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { API, ROUTES, type ApplicationSection, type Invoice } from "@/contracts";
import type { JustificationResponse } from "@/contracts/api";
import { Button, Card, PageTitle, Spinner, Tag } from "@/components/ui";
import { Icon } from "@/components/ui/icons";
import { ApiClientError, apiGet, apiSend } from "@/lib/api-client";
import { downscalePhoto } from "@/features/works/image";
import { euros } from "../format";
import { gapCount, memoriaAsText } from "../export";
import s from "./justification.module.css";

/** Spanish text for a failed request (server 4xx messages are already Spanish; AI and 5xx details never shown). */
function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) {
    if ([400, 404, 409, 429].includes(e.status)) return e.message;
    if (e.code === "network") return "Sin conexión. Comprueba la red e inténtalo de nuevo.";
  }
  return fallback;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const num = (v: string): number | null => {
  const n = Number(v.trim().replace(",", "."));
  return v.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

export function JustificationPage({ applicationId }: { applicationId: string }) {
  const [state, setState] = useState<JustificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"photo" | "memoria" | "save" | null>(null);
  const [hint, setHint] = useState("");
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setState(await apiGet<JustificationResponse>(`${API.justification}?applicationId=${encodeURIComponent(applicationId)}`));
      setError(null);
    } catch (e) {
      setError(errorText(e, "No hemos podido abrir la justificación."));
    }
  }, [applicationId]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (kind: "photo" | "memoria" | "save", fn: () => Promise<JustificationResponse>, fallback: string) => {
    setBusy(kind);
    setError(null);
    try {
      setState(await fn());
      return true;
    } catch (e) {
      setError(errorText(e, fallback));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const onPhoto = async (f: File | undefined) => {
    if (!f) return;
    const ok = await run(
      "photo",
      async () => {
        const { dataUrl } = await downscalePhoto(f);
        return apiSend<JustificationResponse>(API.justificationInvoices, { applicationId, imageDataUrl: dataUrl, hint: hint.trim() || undefined });
      },
      "No hemos podido leer la factura. Prueba otra foto o inténtalo de nuevo.",
    );
    if (ok) setHint("");
    if (file.current) file.current.value = "";
  };

  const patchInvoice = (id: string, patch: Record<string, unknown>) =>
    run("save", () => apiSend<JustificationResponse>(API.justificationInvoice(id), patch, "PATCH"), "No hemos podido guardar los cambios.");
  const removeInvoice = (id: string) => run("save", () => apiSend<JustificationResponse>(API.justificationInvoice(id), {}, "DELETE"), "No hemos podido eliminar la factura.");

  if (!state)
    return (
      <>
        <PageTitle kicker="Justificación">Justifica tu subvención</PageTitle>
        {error ? <p className={s.error}>{error}</p> : <Spinner label="Abriendo la justificación…" />}
      </>
    );

  const { application, call, invoices, summary, memoria } = state;
  const sections = (memoria?.sections ?? []).map((sec) => ({ ...sec, body: drafts[sec.key] ?? sec.body }));
  const gaps = gapCount(memoria ? { sections } : null);
  const dirty = !!memoria && sections.some((sec, i) => sec.body !== memoria.sections[i].body);

  return (
    <>
      <PageTitle kicker="Justificación">{call.title}</PageTitle>
      <p className={s.lead}>
        Haz una foto a cada factura: la leemos, la asignamos a una partida de tu presupuesto y te avisamos si algo se desvía. Al final preparamos la memoria con tus datos.
      </p>
      {state.mode === "mock" && (
        <p className={s.note}>Modo de pruebas: sin la IA no podemos leer la foto. Escribe debajo qué es (emisor, concepto e importe) y revisa los datos a mano.</p>
      )}

      <Card>
        <h2>Añadir una factura</h2>
        <div className={s.capture}>
          <input
            className={s.hint}
            aria-label="Qué es esta factura (opcional)"
            placeholder="Opcional: Papelería Sol, papel de acuarela, 84,50 €"
            maxLength={300}
            value={hint}
            disabled={busy !== null}
            onChange={(e) => setHint(e.target.value)}
          />
          <input ref={file} id="invoice-photo" className={s.file} type="file" accept="image/*" capture="environment" disabled={busy !== null} onChange={(e) => void onPhoto(e.target.files?.[0])} />
          <label htmlFor="invoice-photo" className={`btn btn-primary ${busy ? "disabled" : ""}`} aria-disabled={busy !== null}>
            <Icon name="camera" size={18} /> {busy === "photo" ? "Leyendo la factura…" : "Fotografiar una factura"}
          </label>
        </div>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </Card>

      <Card>
        <h2>Tu presupuesto, partida a partida</h2>
        <div className={s.summary}>
          <p className={s.total}>
            <span>Justificado</span>
            <span>
              {euros(summary.spentEur)} de {euros(summary.budgetEur)} ({Math.round(summary.pct * 100)} %)
            </span>
          </p>
          {summary.lines.map((l) => (
            <div key={l.concept} className={s.line}>
              <div className={s.lineHead}>
                <span>{l.concept}</span>
                <span>
                  {euros(l.spentEur)} / {euros(l.budgetEur)}
                </span>
              </div>
              <div className={s.track} role="progressbar" aria-label={l.concept} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(l.pct * 100))}>
                <div className={`${s.fill} ${l.pct > 1 ? s.fillOver : ""}`} style={{ width: `${Math.min(100, l.pct * 100)}%` }} />
              </div>
              <small className={s.lineHead}>
                <span>{l.invoiceCount === 1 ? "1 factura" : `${l.invoiceCount} facturas`}</span>
                <span>{l.remainingEur >= 0 ? `Quedan ${euros(l.remainingEur)}` : `Te pasas ${euros(-l.remainingEur)}`}</span>
              </small>
            </div>
          ))}
        </div>
      </Card>

      {summary.alerts.length > 0 && (
        <Card>
          <h2>Avisos</h2>
          <p className={s.note}>Son orientativos: cada convocatoria fija sus márgenes y plazos en sus bases.</p>
          <ul className={s.alerts}>
            {summary.alerts.map((a) => (
              <li key={a.id} className={`${s.alert} ${s[a.severity]}`}>
                <Icon name="alert" size={18} />
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2>Facturas ({invoices.length})</h2>
        {invoices.length === 0 && <p className={s.note}>Aún no has añadido ninguna.</p>}
        {invoices.map((inv) => (
          <InvoiceCard key={inv.id} inv={inv} lines={application.budget.map((b) => b.concept)} busy={busy !== null} onPatch={patchInvoice} onRemove={removeInvoice} />
        ))}
      </Card>

      <Card>
        <h2>Memoria final de justificación</h2>
        {!memoria && (
          <>
            <p className={s.note}>Cuéntanos con tus palabras qué has hecho (opcional). Lo que no sepamos quedará marcado como hueco para que lo completes tú.</p>
            <textarea className={s.notes} aria-label="Qué has hecho" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej.: pinté la serie en mi estudio de Malpica entre marzo y junio y la expuse en…" />
          </>
        )}
        {memoria && state.memoriaStale && (
          <p className={s.stale} role="status">
            Has cambiado facturas o el presupuesto después de preparar la memoria. Vuelve a prepararla para actualizar la cuenta justificativa (se perderán tus ediciones de esta versión).
          </p>
        )}
        {memoria && gaps > 0 && <p className={s.gaps}>Te faltan {gaps === 1 ? "1 hueco" : `${gaps} huecos`} por completar: están marcados como «[Completa: …]».</p>}
        {sections.map((sec: ApplicationSection) => (
          <div key={sec.key} className={s.section}>
            <h3>{sec.title}</h3>
            <textarea
              className={s.notes}
              aria-label={sec.title}
              rows={Math.min(14, Math.max(4, sec.body.split("\n").length + 1))}
              value={sec.body}
              onChange={(e) => setDrafts({ ...drafts, [sec.key]: e.target.value })}
            />
          </div>
        ))}
        <div className={s.actions}>
          <Button
            onClick={() => run("memoria", () => apiSend<JustificationResponse>(API.justificationMemoria, { applicationId, notes: notes.trim() || undefined }), "No hemos podido preparar la memoria. Inténtalo de nuevo.").then((ok) => ok && setDrafts({}))}
            disabled={busy !== null || invoices.length === 0}
          >
            {busy === "memoria" ? "Preparando la memoria…" : memoria ? "Volver a prepararla" : "Preparar la memoria"}
          </Button>
          {memoria && (
            <>
              <Button
                variant="ghost"
                disabled={busy !== null || !dirty}
                onClick={() => run("save", () => apiSend<JustificationResponse>(API.justificationMemoria, { applicationId, sections }, "PATCH"), "No hemos podido guardar la memoria.").then((ok) => ok && setDrafts({}))}
              >
                Guardar mis cambios
              </Button>
              <Button variant="quiet" onClick={() => download(`justificacion-${call.id}.txt`, memoriaAsText(call, { sections }))}>
                Descargar (.txt)
              </Button>
            </>
          )}
        </div>
        {invoices.length === 0 && <p className={s.note}>Añade al menos una factura para poder preparar la memoria.</p>}
      </Card>

      <p className={s.footer}>Mecena prepara; tú presentas la justificación con tu certificado digital. Revisa cada dato contra tus facturas originales.</p>
      <div className={s.actions}>
        <Link href={ROUTES.application(application.callId)} className="btn btn-quiet">
          Ver la solicitud
        </Link>
      </div>
    </>
  );
}

function InvoiceCard({
  inv,
  lines,
  busy,
  onPatch,
  onRemove,
}: {
  inv: Invoice;
  lines: string[];
  busy: boolean;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ supplier: inv.supplier, taxId: inv.taxId ?? "", number: inv.number ?? "", date: inv.date ?? "", concept: inv.concept, total: String(inv.totalEur || "") });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const total = num(f.total);
  return (
    <div className={s.invoice}>
      <div className={s.invHead}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={s.thumb} src={inv.imageUrl} alt={`Foto de la factura de ${inv.supplier || "un proveedor"}`} />
        <div className={s.invMain}>
          <p className={s.invTitle}>
            <span>{inv.supplier || "Sin emisor"}</span>
            <span>{inv.totalEur > 0 ? euros(inv.totalEur) : "—"}</span>
          </p>
          <p className={s.invMeta}>
            {[inv.concept, inv.number && `nº ${inv.number}`, inv.date].filter(Boolean).join(" · ") || "Faltan datos: complétalos a mano"}
          </p>
          <p>
            {inv.extractedBy === "vision" && <Tag tone="ok">Leída por la IA</Tag>} {inv.extractedBy === "mock" && <Tag>Lectura simulada</Tag>}{" "}
            {inv.extractedBy === "manual" && <Tag tone="warn">A mano</Tag>}
          </p>
        </div>
      </div>
      <label className={s.field}>
        Partida del presupuesto
        <select
          value={inv.lineConcept ?? ""}
          disabled={busy}
          onChange={(e) => void onPatch(inv.id, { lineConcept: e.target.value || null })}
        >
          <option value="">Sin asignar</option>
          {lines.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {open && (
        <div className={s.form}>
          <label className={`${s.field} ${s.wide}`}>
            Emisor
            <input value={f.supplier} onChange={set("supplier")} maxLength={200} />
          </label>
          <label className={s.field}>
            NIF/CIF del emisor
            <input value={f.taxId} onChange={set("taxId")} maxLength={40} />
          </label>
          <label className={s.field}>
            Nº de factura
            <input value={f.number} onChange={set("number")} maxLength={60} />
          </label>
          <label className={s.field}>
            Fecha
            <input type="date" value={f.date} onChange={set("date")} />
          </label>
          <label className={s.field}>
            Total (€)
            <input inputMode="decimal" value={f.total} onChange={set("total")} />
          </label>
          <label className={`${s.field} ${s.wide}`}>
            Concepto
            <input value={f.concept} onChange={set("concept")} maxLength={300} />
          </label>
          <div className={`${s.actions} ${s.wide}`}>
            <Button
              disabled={busy || (f.total.trim() !== "" && total === null)}
              onClick={async () => {
                const ok = await onPatch(inv.id, {
                  supplier: f.supplier,
                  taxId: f.taxId.trim() || null,
                  number: f.number.trim() || null,
                  date: f.date || null,
                  concept: f.concept,
                  totalEur: total ?? 0,
                });
                if (ok) setOpen(false);
              }}
            >
              Guardar datos
            </Button>
            <Button variant="quiet" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {!open && (
        <div className={s.actions}>
          <Button variant="ghost" disabled={busy} onClick={() => setOpen(true)}>
            Revisar o corregir datos
          </Button>
          <Button variant="quiet" disabled={busy} onClick={() => void onRemove(inv.id)}>
            Eliminar
          </Button>
        </div>
      )}
    </div>
  );
}
