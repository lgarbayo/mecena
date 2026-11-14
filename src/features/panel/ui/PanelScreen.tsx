"use client";
/**
 * /panel: summary, members with their matched open calls and nearest deadline, invitations. The demo organisation is
 * always labelled as such. Invitations the signed-in person received (and what they currently share) sit at the bottom.
 */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { API, ROUTES } from "@/contracts";
import { Button, Card, Tag } from "@/components/ui";
import { apiSend, ApiClientError } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import type { MyInvitations, Panel, PanelCall } from "../service";
import styles from "./panel.module.css";

const KIND = { school: "Escuela", association: "Asociación" } as const;
const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const left = (d: number | null) => (d === null ? "" : d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`);

function Deadline({ c }: { c: PanelCall }) {
  return c.deadline ? (
    <>
      {fmtDate(c.deadline)} ({left(c.daysLeft)})
    </>
  ) : (
    <>{c.deadlineText || "Sin plazo fijo"}</>
  );
}

export function PanelScreen({ panel, mine }: { panel: Panel & { hasOrg: boolean }; mine: MyInvitations }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"school" | "association">("school");
  const [email, setEmail] = useState("");

  // Each mutation carries an Idempotency-Key, reused on a retry: a double tap never creates two organisations or invitations.
  const createOrg = useAction((idempotencyKey: string, orgName: string, orgKind: "school" | "association") =>
    apiSend(API.panel, { name: orgName, kind: orgKind }, "POST", undefined, { idempotencyKey }),
  );
  const inviteOne = useAction((idempotencyKey: string, to: string) => apiSend(API.panelInvitations, { email: to }, "POST", undefined, { idempotencyKey }));
  const accept = useAction((idempotencyKey: string, id: string) => apiSend(API.panelMembership(id), {}, "PATCH", undefined, { idempotencyKey }));
  const endOne = useAction((idempotencyKey: string, id: string) => apiSend(API.panelMembership(id), {}, "DELETE", undefined, { idempotencyKey }));
  const all = [createOrg, inviteOne, accept, endOne];
  const busy = all.some((a) => a.pending);
  const failure = all.find((a) => a.error)?.error;
  const error = failure === undefined ? null : failure instanceof ApiClientError ? failure.message : "No he podido hacerlo. Inténtalo de nuevo.";

  /** Runs one action (clearing the others' errors), refreshes the server-rendered panel on success. */
  const fire = async <A extends unknown[]>(a: { run: (...args: A) => Promise<unknown> }, ...args: A): Promise<boolean> => {
    for (const other of all) if ((other as unknown) !== a) other.reset();
    let ok = false;
    try {
      ok = (await a.run(...args)) !== undefined;
    } catch {
      ok = false;
    }
    if (ok) router.refresh();
    return ok;
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    void fire(createOrg, name, kind).then((ok) => ok && setName(""));
  };
  const invite = (e: FormEvent) => {
    e.preventDefault();
    void fire(inviteOne, email).then((ok) => ok && setEmail(""));
  };
  const end = (id: string, ask: string) => {
    if (window.confirm(ask)) void fire(endOne, id);
  };

  const { summary: s } = panel;
  return (
    <>
      <Card>
        <p className={styles.orgLine}>
          <strong>{panel.org.name}</strong> <Tag tone={panel.demo ? "warn" : "ok"}>{panel.demo ? "Datos de demostración" : KIND[panel.org.kind]}</Tag>
        </p>
        {panel.demo ? (
          <p className={styles.note}>
            Esto es una organización de ejemplo con dos perfiles de demostración, cruzados con las convocatorias reales abiertas hoy. No son personas
            reales.
            {panel.hasOrg && (
              <>
                {" "}
                <Link href={ROUTES.panel}>Volver a mi organización</Link>.
              </>
            )}
          </p>
        ) : (
          <p className={styles.note}>
            Solo ves a quien ha aceptado tu invitación, y solo su nombre, disciplina y convocatorias. Nunca su dossier, sus obras ni sus borradores.{" "}
            <Link href={`${ROUTES.panel}?demo=1`}>Ver ejemplo</Link>.
          </p>
        )}
        <dl className={styles.stats}>
          <div>
            <dt>Miembros</dt>
            <dd>{s.members}</dd>
          </div>
          <div>
            <dt>Convocatorias abiertas con encaje</dt>
            <dd>{s.openCallsWithFit}</dd>
          </div>
          <div>
            <dt>Miembros con alguna opción</dt>
            <dd>
              {s.membersWithMatches}/{s.members}
            </dd>
          </div>
        </dl>
        {(s.incompleteMembers > 0 || s.pendingInvitations > 0) && (
          <p className={styles.note}>
            {s.incompleteMembers > 0 && `${s.incompleteMembers} miembro(s) aún no han completado su perfil y dossier. `}
            {s.pendingInvitations > 0 && `${s.pendingInvitations} invitación(es) pendientes.`}
          </p>
        )}
      </Card>

      <Card>
        <h2 className={styles.h2}>Próximos plazos</h2>
        {s.upcomingDeadlines.length === 0 ? (
          <p className={styles.note}>Ninguna convocatoria con fecha de cierre encaja ahora con tus miembros.</p>
        ) : (
          <ul className={styles.list}>
            {s.upcomingDeadlines.map((c) => (
              <li key={c.callId}>
                <div>
                  <Link href={ROUTES.call(c.callId)}>{c.title}</Link>
                  <p className={styles.sub}>{c.memberNames.join(", ")}</p>
                </div>
                <span className={styles.when}>
                  <Deadline c={c} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className={styles.h2}>Miembros</h2>
      {panel.members.length === 0 && (
        <Card>
          <p className={styles.note}>Todavía no hay miembros. Invita por correo: aparecerán aquí cuando acepten y tengan su dossier hecho.</p>
        </Card>
      )}
      {panel.members.map((m) => (
        <Card key={m.id}>
          <div className={styles.memberHead}>
            <div>
              <h3 className={styles.h3}>{m.displayName}</h3>
              <p className={styles.sub}>{[m.kind === "business" ? "Pyme / autónomo" : "Creador/a", ...m.disciplines, m.location].filter(Boolean).join(" · ")}</p>
            </div>
            {!panel.demo && <Button variant="quiet" disabled={busy} onClick={() => end(m.id, `¿Quitar a ${m.displayName} del panel?`)}>Quitar</Button>}
          </div>
          <p className={styles.sub}>
            {m.matches.length === 0 ? "Sin convocatorias abiertas que encajen ahora." : `${m.matches.length} convocatoria(s) abiertas con encaje.`}
            {m.nextDeadline && (
              <>
                {" "}
                Próximo plazo: <Deadline c={m.nextDeadline} />.
              </>
            )}
          </p>
          {m.matches.length > 0 && (
            <ul className={styles.list}>
              {m.matches.slice(0, 5).map((c) => (
                <li key={c.callId}>
                  <div>
                    <Link href={ROUTES.call(c.callId)}>{c.title}</Link>
                    <p className={styles.sub}>
                      {c.organizer} · {c.amountText}
                    </p>
                  </div>
                  <span className={styles.when}>
                    <Tag tone={c.fit === "alto" ? "ok" : "neutral"}>{c.fit}</Tag> <Deadline c={c} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      {!panel.demo || !panel.hasOrg ? (
        <Card>
          {panel.hasOrg ? (
            <form onSubmit={invite} className={styles.form}>
              <h2 className={styles.h2}>Invitar a un miembro</h2>
              <p className={styles.note}>Le llegará la invitación al iniciar sesión con ese correo. Hasta que acepte, no ves nada de esa persona.</p>
              <div className={styles.row}>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.org" aria-label="Correo de la persona" />
                <Button disabled={busy}>Invitar</Button>
              </div>
              {panel.invitations.length > 0 && (
                <ul className={styles.list}>
                  {panel.invitations.map((i) => (
                    <li key={i.id}>
                      <span>{i.email} · pendiente</span>
                      <Button variant="quiet" type="button" disabled={busy} onClick={() => end(i.id, `¿Retirar la invitación a ${i.email}?`)}>
                        Retirar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          ) : (
            <form onSubmit={create} className={styles.form}>
              <h2 className={styles.h2}>Crea tu organización</h2>
              <p className={styles.note}>Para seguir a varias personas creadoras a la vez. Solo ves a quien acepte tu invitación.</p>
              <div className={styles.row}>
                <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la escuela o asociación" aria-label="Nombre" />
                <select value={kind} onChange={(e) => setKind(e.target.value as "school" | "association")} aria-label="Tipo">
                  <option value="school">Escuela</option>
                  <option value="association">Asociación</option>
                </select>
                <Button disabled={busy}>Crear</Button>
              </div>
            </form>
          )}
        </Card>
      ) : null}

      {(mine.invited.length > 0 || mine.accepted.length > 0) && (
        <Card>
          <h2 className={styles.h2}>Tus invitaciones</h2>
          <ul className={styles.list}>
            {mine.invited.map((i) => (
              <li key={i.id}>
                <div>
                  <strong>{i.orgName}</strong> <Tag>{KIND[i.orgKind]}</Tag>
                  <p className={styles.sub}>Si aceptas, verán el nombre, la disciplina y las convocatorias de tu perfil activo. Nada más.</p>
                </div>
                <span className={styles.actions}>
                  <Button disabled={busy} onClick={() => void fire(accept, i.id)}>
                    Aceptar
                  </Button>
                  <Button variant="quiet" disabled={busy} onClick={() => end(i.id, `¿Rechazar la invitación de ${i.orgName}?`)}>
                    Rechazar
                  </Button>
                </span>
              </li>
            ))}
            {mine.accepted.map((a) => (
              <li key={a.id}>
                <div>
                  <strong>{a.orgName}</strong> <Tag tone="ok">Compartes tu perfil</Tag>
                </div>
                <Button variant="quiet" disabled={busy} onClick={() => end(a.id, `¿Dejar de compartir tu perfil con ${a.orgName}?`)}>
                  Dejar de compartir
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </>
  );
}
