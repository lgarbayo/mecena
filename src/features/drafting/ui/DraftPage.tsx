"use client";
// WP-08 /solicitud/[callId]: draft behind the paywall, written from the user's own words; every text is editable.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  API,
  ROUTES,
  type Application,
  type BudgetLine,
  type Call,
  type TranscriptSegment,
} from "@/contracts";
import { useApp } from "@/components/shell/AppProvider";
import { Button, Card, PageTitle, Spinner } from "@/components/ui";
import { Paywall } from "@/features/purchases/ui/Paywall";
import { ApiClientError, apiGet, apiSend } from "@/lib/api-client";
import { closedEdition, draftAsText } from "./export";
import s from "./draft.module.css";

type Sources = Record<string, TranscriptSegment>;
interface AppRes {
  application: Application | null;
  sources: Sources;
}

const STEPS = [
  "Leyendo las bases…",
  "Usando tus palabras…",
  "Ajustando el presupuesto…",
  "Preparando la lista de documentos…",
];
const euros = (n: number) => `${n.toLocaleString("es-ES", { useGrouping: "always" })} €`;

/** Spanish text for a failed request (server 4xx messages are already Spanish; AI and 5xx details never shown). */
function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError && [400, 404, 409, 429].includes(e.status)) return e.message;
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

/** Body text with "[Completa: …]" gaps highlighted. */
function WithGaps({ text }: { text: string }) {
  const parts = text.split(/(\[Completa:[^\]]*\])/g);
  return (
    <p className={s.body}>
      {parts.map((p, i) =>
        p.startsWith("[Completa:") ? (
          <mark key={i} className={s.gap}>
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

function Progress() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setStep((x) => Math.min(STEPS.length - 1, x + 1)),
      1400,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <ul className={s.progress} role="status" aria-live="polite">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={i < step ? s.done : i === step ? s.active : ""}
        >
          <span className={s.dot} />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function DraftPage({ callId }: { callId: string }) {
  const { profile, appUserId } = useApp();
  const [call, setCall] = useState<Call | null>(null);
  const [app, setApp] = useState<Application | null>(null);
  const [sources, setSources] = useState<Sources>({});
  const [loaded, setLoaded] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // last version the server accepted: blur only saves what really changed
  const serverApp = useRef<Application | null>(null);
  const prewarmed = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const q = `profileId=${encodeURIComponent(profile.id)}`;
    Promise.all([
      apiGet<{ call: Call }>(`${API.call(callId)}?${q}`),
      apiGet<AppRes>(
        `${API.applications}?callId=${encodeURIComponent(callId)}&${q}`,
      ),
    ])
      .then(([c, a]) => {
        setCall(c.call);
        setApp(a.application);
        serverApp.current = a.application;
        setSources(a.sources);
      })
      .catch((e) =>
        setError(errorText(e, "No hemos podido cargar la solicitud. Recarga la página.")),
      )
      .finally(() => setLoaded(true));
  }, [callId, profile]);

  const draft = useCallback(async () => {
    if (!profile) return;
    setError(null);
    setDrafting(true);
    try {
      const r = await apiSend<AppRes>(API.applications, {
        callId,
        profileId: profile.id,
        appUserId,
      });
      setApp(r.application);
      serverApp.current = r.application;
      setSources(r.sources);
    } catch (e) {
      if (e instanceof ApiClientError && e.paymentRequired) setPaywall(true);
      else setError(errorText(e, "No hemos podido redactar la solicitud ahora mismo. Inténtalo de nuevo."));
    } finally {
      setDrafting(false);
    }
  }, [callId, profile, appUserId]);

  const save = useCallback(
    async (
      patch: Partial<Pick<Application, "sections" | "budget" | "checklist">>,
    ) => {
      if (!app) return;
      const optimistic = { ...app, ...patch };
      setApp(optimistic);
      const last = serverApp.current;
      if (last && (Object.keys(patch) as (keyof typeof patch)[]).every((k) => JSON.stringify(patch[k]) === JSON.stringify(last[k]))) return;
      try {
        const r = await apiSend<AppRes>(
          API.application(app.id),
          patch,
          "PATCH",
        );
        setApp(r.application);
        serverApp.current = r.application;
        setSources(r.sources);
        setError(null);
        setSaved(true);
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1500);
      } catch (e) {
        setError(errorText(e, "No hemos podido guardar el cambio. Inténtalo de nuevo."));
      }
    },
    [app],
  );

  // Prewarm the jury while the user reads the draft: the score is usually ready when they open the tribunal.
  // The server shares one scoring per version, so opening the jury meanwhile joins it instead of paying twice.
  useEffect(() => {
    if (!app || prewarmed.current === app.id) return;
    prewarmed.current = app.id;
    fetch(API.jury, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId: app.id }) }).catch(() => {});
  }, [app]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      setError("No hemos podido copiar: selecciona el texto en Editar y cópialo a mano.");
    }
  };

  if (!loaded) return <Spinner />;
  if (!call)
    return <p className={s.error}>{error ?? "No encontramos esta convocatoria."}</p>;

  const edition = closedEdition(call);

  const header = (
    <>
      <PageTitle kicker="Solicitud">{call.title}</PageTitle>
      <p className={s.lead}>
        {call.organizer} · {call.amountText}
      </p>
    </>
  );

  if (!app)
    return (
      <>
        {header}
        {drafting ? (
          <Progress />
        ) : (
          <Card>
            {edition && (
              <p className={s.closed} role="note">
                <b>La edición {edition.year} está cerrada.</b> Puedes dejar la solicitud preparada para la edición {edition.next}: cuando se publiquen las bases nuevas, revisa plazos, importes y criterios. Prepararla cuenta como una solicitud de tu plan (Pro o Solicitud premium).
              </p>
            )}
            <p>
              {profile?.kind === "business"
                ? "Mecena redacta la presentación de tu empresa, la memoria del proyecto, los objetivos y el presupuesto con lo que nos has contado, siguiendo los criterios de las bases. Tú revisas y tienes la última palabra."
                : "Mecena redacta la memoria, tu declaración y el presupuesto con lo que nos has contado, siguiendo los criterios de las bases. Tú revisas y tienes la última palabra."}
            </p>
            <Button onClick={draft}>{edition ? `Prepárala para la edición ${edition.next}` : "Prepárame la solicitud"}</Button>
            {error && (
              <p className={s.error}>
                {error}{" "}
                <Button variant="quiet" onClick={draft}>
                  Reintentar
                </Button>
              </p>
            )}
          </Card>
        )}
        <Paywall
          open={paywall}
          trigger="draft_application"
          onClose={() => setPaywall(false)}
          onPurchased={() => {
            setPaywall(false);
            draft();
          }}
        />
      </>
    );

  const total = app.budget.reduce((sum, l) => sum + l.amountEur, 0);
  const cap = call.amountEur.max;
  const setLine = (i: number, patch: Partial<BudgetLine>) =>
    setApp({
      ...app,
      budget: app.budget.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    });
  const allowed = call.allowedExpenses;

  return (
    <>
      {header}
      {saved && <p className={s.saved}>Guardado</p>}
      {error && <p className={s.error}>{error}</p>}

      {app.sections.map((sec, i) => {
        const quotes = sec.sourceSegmentIds
          .map((id) => sources[id])
          .filter(Boolean);
        return (
          <Card key={sec.key}>
            <div className={s.sectionHead}>
              <h2>{sec.title}</h2>
              <span className={s.sectionTools}>
                <Button variant="quiet" onClick={() => copy(sec.key, sec.body)}>
                  {copied === sec.key ? "Copiado" : "Copiar"}
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => setEditing(editing === sec.key ? null : sec.key)}
                >
                  {editing === sec.key ? "Listo" : "Editar"}
                </Button>
              </span>
            </div>
            {editing === sec.key ? (
              <textarea
                className={s.edit}
                defaultValue={sec.body}
                aria-label={`Editar ${sec.title}`}
                onBlur={(e) => {
                  if (e.target.value !== sec.body)
                    save({
                      sections: app.sections.map((x, j) =>
                        j === i ? { ...x, body: e.target.value } : x,
                      ),
                    });
                }}
              />
            ) : (
              <WithGaps text={sec.body} />
            )}
            {quotes.length > 0 && (
              <details className={s.sources}>
                <summary>Escrito con tus palabras ({quotes.length})</summary>
                {quotes.map((q) => (
                  <blockquote key={q.id}>«{q.text}»</blockquote>
                ))}
              </details>
            )}
          </Card>
        );
      })}

      {(app.budget.length > 0 ||
        allowed.length > 0 ||
        !["premio", "certamen", "convocatoria"].includes(call.type)) && (
        <Card>
          <h2>Presupuesto</h2>
          <table className={s.budget}>
            <tbody>
              {app.budget.map((l, i) => (
                <tr key={i}>
                  <td>
                    <input
                      aria-label="Concepto"
                      value={l.concept}
                      onChange={(e) => setLine(i, { concept: e.target.value })}
                      onBlur={() => save({ budget: app.budget })}
                    />
                    {allowed.length > 0 ? (
                      <select
                        aria-label="Tipo de gasto"
                        value={l.expenseType}
                        onChange={(e) =>
                          save({
                            budget: app.budget.map((x, j) =>
                              j === i
                                ? { ...x, expenseType: e.target.value }
                                : x,
                            ),
                          })
                        }
                      >
                        {allowed.map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    ) : null}
                  </td>
                  <td className={s.amount}>
                    <input
                      aria-label="Importe en euros"
                      inputMode="numeric"
                      value={l.amountEur}
                      onChange={(e) =>
                        setLine(i, {
                          amountEur:
                            Number(e.target.value.replace(/\D/g, "")) || 0,
                        })
                      }
                      onBlur={() => save({ budget: app.budget })}
                    />
                  </td>
                  <td>
                    <Button
                      variant="quiet"
                      aria-label={`Quitar ${l.concept}`}
                      onClick={() =>
                        save({ budget: app.budget.filter((_, j) => j !== i) })
                      }
                    >
                      ×
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            variant="quiet"
            onClick={() =>
              save({
                budget: [
                  ...app.budget,
                  {
                    concept: "Nueva partida",
                    amountEur: 100,
                    expenseType: allowed[0] ?? "Otros",
                  },
                ],
              })
            }
          >
            + Añadir partida
          </Button>
          {app.budget.some((l) => l.amountEur === 0) && (
            <p className={s.note}>Hay partidas a 0 €: pon su importe o quítalas.</p>
          )}
          <p className={`${s.total} ${cap && total > cap ? s.over : ""}`}>
            <span>Total</span>
            <span>
              {euros(total)}
              {cap ? ` de ${euros(cap)} máx.` : ""}
            </span>
          </p>
          {allowed.length > 0 && (
            <p className={s.note}>
              Solo partidas admitidas por las bases: {allowed.join(", ")}.
            </p>
          )}
        </Card>
      )}

      <Card>
        <h2>Documentos</h2>
        {app.checklist.map((c, i) => (
          <label key={c.item} className={s.check}>
            <input
              type="checkbox"
              checked={c.done}
              onChange={(e) =>
                save({
                  checklist: app.checklist.map((x, j) =>
                    j === i ? { ...x, done: e.target.checked } : x,
                  ),
                })
              }
            />
            <span>
              {c.item}
              {c.hint && <span className={s.hint}>{c.hint}</span>}
            </span>
          </label>
        ))}
      </Card>

      <p className={s.footer}>
        Mecena prepara; tú presentas con tu certificado digital.
      </p>
      <Button
        variant="quiet"
        onClick={() =>
          download(`solicitud-${call.id}.txt`, draftAsText(call, app))
        }
      >
        Descargar la solicitud (.txt)
      </Button>
      <div className={s.actions}>
        <Link href={ROUTES.jury(app.id)} className="btn btn-primary">
          Pasar el tribunal simulado
        </Link>
        <Link href={ROUTES.call(call.id)} className="btn btn-quiet">
          Volver a la convocatoria
        </Link>
      </div>
    </>
  );
}
