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
const euros = (n: number) => `${n.toLocaleString("es-ES")} €`;

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
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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
        setSources(a.sources);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudo cargar"),
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
      setSources(r.sources);
    } catch (e) {
      if (e instanceof ApiClientError && e.paymentRequired) setPaywall(true);
      else
        setError(
          e instanceof ApiClientError && e.status === 502
            ? "Claude no ha podido redactar ahora mismo."
            : e instanceof Error
              ? e.message
              : "Error",
        );
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
      try {
        const r = await apiSend<AppRes>(
          API.application(app.id),
          patch,
          "PATCH",
        );
        setApp(r.application);
        setSources(r.sources);
        setSaved(true);
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar");
      }
    },
    [app],
  );

  if (!loaded) return <Spinner />;
  if (!call)
    return <p className={s.error}>{error ?? "Convocatoria no encontrada"}</p>;

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
            <p>
              {profile?.kind === "business"
                ? "Mecena redacta la presentación de tu empresa, la memoria del proyecto, los objetivos y el presupuesto con lo que nos has contado, siguiendo los criterios de las bases. Tú revisas y tienes la última palabra."
                : "Mecena redacta la memoria, tu declaración y el presupuesto con lo que nos has contado, siguiendo los criterios de las bases. Tú revisas y tienes la última palabra."}
            </p>
            <Button onClick={draft}>Prepárame la solicitud</Button>
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
              <Button
                variant="quiet"
                onClick={() => setEditing(editing === sec.key ? null : sec.key)}
              >
                {editing === sec.key ? "Listo" : "Editar"}
              </Button>
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
