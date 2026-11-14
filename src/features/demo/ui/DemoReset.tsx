"use client";
/**
 * /demo: plan-B panel for the stage. Everything acts on the signed-in account only (nobody else's data is touched):
 * start from scratch, load a ready-made scenario, and the per-account switches (deterministic jury, simulated AI).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { API, ROUTES } from "@/contracts";
import type { z } from "zod";
import type { DemoResetResponse } from "@/contracts/api";
import { Card, LoadingRegion, Skeleton, Tag } from "@/components/ui";
import { useApp } from "@/components/shell/AppProvider";
import { apiGet, apiSend, ApiClientError } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { SAMPLE_INVOICE_URL } from "../sample-invoice";
import type { DemoStatus } from "../status";
import styles from "./demo.module.css";

type Scenario = "blank" | "onboarded" | "pro" | "business";
type ResetResult = z.infer<typeof DemoResetResponse>;

export const SCENARIOS: { id: Scenario; title: string; what: string; when: string; confirm: string }[] = [
  {
    id: "blank",
    title: "Empezar de cero",
    what: "Borra tu perfil, tus obras, tu dossier y tus solicitudes. Te deja una creadora en blanco y vuelve a salir la oferta de Mecena Pro. Deja montado el panel de la escuela de ejemplo (3 miembros que ya aceptaron).",
    when: "Antes de salir al escenario, para hacer la entrevista en directo. El panel B2B queda listo en /panel.",
    confirm: "Se borrarán tu perfil, tus obras, tu dossier y tus solicitudes. ¿Empezar de cero?",
  },
  {
    id: "onboarded",
    title: "Artista de ejemplo",
    what: "Antía Varela, ilustradora y pintora de A Coruña: perfil completo, entrevista transcrita, dossier con todas las secciones y 3 obras con ficha. Sin Pro: la oferta sigue saliendo.",
    when: "Si falla el micro o la IA tarda en la entrevista: enseñas el perfil, el dossier, el PDF y las convocatorias ya hechos.",
    confirm: "Se borrarán tus datos y se cargará la artista de ejemplo. ¿Seguimos?",
  },
  {
    id: "pro",
    title: "Artista Pro con solicitud",
    what: "La artista de ejemplo con Mecena Pro de demo y una solicitud ya redactada para una convocatoria abierta, puntuada 61 por el tribunal. «Aplicar mejoras» la sube a 84. Trae 3 facturas ya asignadas, con una partida pasada de presupuesto, para enseñar en la justificación, y la escuela de ejemplo con 3 miembros en el panel. Activa también el tribunal determinista.",
    when: "Si la compra de RevenueCat falla o tarda, o si el borrador o el tribunal tardan más de 8 segundos. Es también la cuenta que enseña la justificación (foto de factura en directo) y el panel.",
    confirm: "Se borrarán tus datos y se cargará la artista Pro con su solicitud. ¿Seguimos?",
  },
  {
    id: "business",
    title: "Pyme de ejemplo",
    what: "Obradoiro Mareira, taller de cerámica de Lugo con 4 personas en plantilla: perfil de empresa completo y memoria de capacidades. Entras en modo Pyme (la artista de ejemplo queda en modo Creador/a).",
    when: "Para el cambio a Pyme si el perfil de empresa está vacío.",
    confirm: "Se borrarán tus datos y se cargará la pyme de ejemplo. ¿Seguimos?",
  },
];

export function DemoReset({ email }: { email: string }) {
  const { refresh, profile } = useApp();
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [busy, setBusy] = useState<Scenario | "settings" | null>(null);
  // each confirmed reset / switch carries an Idempotency-Key: a double tap or a retried request runs it once
  const lastError = useRef<unknown>(null);
  const resetAction = useAction(async (idempotencyKey: string, scenario: Scenario, business: boolean) => {
    try {
      return await apiSend<ResetResult>(API.demoReset, { scenario, withBusiness: business }, "POST", undefined, { idempotencyKey });
    } catch (e) {
      lastError.current = e;
      throw e;
    }
  });
  const settingsAction = useAction((idempotencyKey: string, patch: Partial<Record<"deterministicJury" | "aiMock", boolean>>) =>
    apiSend<DemoStatus>(API.demoSettings, patch, "POST", undefined, { idempotencyKey }),
  );
  const [done, setDone] = useState<ResetResult | null>(null);
  const [error, setError] = useState("");
  const [withBusiness, setWithBusiness] = useState(true);

  const load = useCallback(async () => {
    setStatus(await apiGet<DemoStatus>(API.demoSettings));
  }, []);
  useEffect(() => {
    load().catch(() => setError("No se ha podido leer el estado de la demo. Recarga la página."));
  }, [load]);

  const run = async (s: (typeof SCENARIOS)[number]) => {
    if (busy || !window.confirm(s.confirm)) return;
    setBusy(s.id);
    setError("");
    setDone(null);
    lastError.current = null;
    try {
      const r = await resetAction.run(s.id, withBusiness);
      if (!r) throw lastError.current ?? new Error("reset");
      await refresh();
      await load();
      setDone(r);
    } catch (e) {
      setError(e instanceof ApiClientError && e.status === 403 ? e.message : "No se ha podido cargar. Prueba otra vez.");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (key: "deterministicJury" | "aiMock", value: boolean) => {
    if (busy) return;
    setBusy("settings");
    setError("");
    try {
      const next = await settingsAction.run({ [key]: value });
      if (!next) throw new Error("settings");
      setStatus(next);
    } catch {
      setError("No se ha podido cambiar el interruptor. Prueba otra vez.");
    } finally {
      setBusy(null);
    }
  };

  const kind = profile?.kind ?? status?.activeProfileKind ?? "creator";
  const proLocked = status ? !status.canLoadPro : false;

  return (
    <>
      <Card>
        <p className={styles.lead}>
          Todo lo que hagas aquí afecta solo a la cuenta <strong>{email}</strong>. Las demás cuentas no se tocan.
        </p>
        {!status && !error && (
          <LoadingRegion label="Cargando el estado de la demo…">
            <div className={styles.skeletonTags}>
              {[72, 112, 128, 64, 108].map((w, i) => (
                <Skeleton key={i} width={w} height={24} radius={9999} />
              ))}
            </div>
            <Skeleton width="85%" height={13} style={{ marginTop: 14 }} />
          </LoadingRegion>
        )}
        {status && (
          <div className={styles.tags} aria-label="Estado de la cuenta">
            <Tag tone={status.effectiveAiMode === "mock" ? "warn" : "ok"}>IA: {status.effectiveAiMode === "mock" ? "simulada" : "Claude"}</Tag>
            <Tag tone={status.settings.deterministicJury ? "warn" : "neutral"}>Tribunal: {status.settings.deterministicJury ? "determinista" : "Claude"}</Tag>
            <Tag tone={status.purchasesMode === "mock" ? "warn" : "ok"}>Pagos: {status.purchasesMode === "mock" ? "modo prueba" : "RevenueCat sandbox"}</Tag>
            <Tag tone={status.pro ? "accent" : "neutral"}>{status.pro ? (status.proIsDemoGrant ? "Pro (demo)" : "Pro") : "Gratis"}</Tag>
            <Tag>Modo: {kind === "business" ? "Pyme" : "Creador/a"}</Tag>
          </div>
        )}
        {status && (
          <p className={styles.meta}>
            Cliente de RevenueCat: <code>{status.appUserId}</code> · Convocatorias abiertas: {status.openCalls.creator} para artistas, {status.openCalls.business} para pymes
          </p>
        )}
      </Card>

      <Card>
        <h2 className={styles.h2}>Escenarios</h2>
        <p className={styles.intro}>Cada botón borra tus datos y deja la cuenta lista en un toque. Te pedirá confirmación.</p>
        <div className={styles.scenarios}>
          {SCENARIOS.map((s) => {
            const check = status?.scenarios.find((c) => c.scenario === s.id);
            const locked = s.id === "pro" && proLocked;
            return (
              <div key={s.id} className={styles.scenario}>
                <button type="button" className={`btn ${s.id === "blank" ? "btn-primary" : "btn-secondary"}`} onClick={() => run(s)} disabled={busy !== null || locked || check?.ok === false}>
                  {busy === s.id ? "Cargando…" : s.title}
                </button>
                <p className={styles.what}>{s.what}</p>
                <p className={styles.when}>
                  <strong>Cuándo:</strong> {s.when}
                </p>
                {s.id === "blank" && (
                  <label className={styles.check}>
                    <input type="checkbox" checked={withBusiness} onChange={(e) => setWithBusiness(e.target.checked)} />
                    Dejar la pyme de ejemplo para el cambio a Pyme
                  </label>
                )}
                {locked && (
                  <p role="note" className={styles.note}>
                    Solo para las cuentas de demo: el servidor tiene que tener tu email en <code>DEMO_EMAILS</code>. Así no se salta la verificación real de RevenueCat.
                  </p>
                )}
                {check && !check.ok && (
                  <p role="alert" className={styles.problem}>
                    No se puede cargar: {check.problems.join(" · ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {done && (
          <p role="status" className={styles.done}>
            Listo.{" "}
            {done.scenario === "blank" && <Link href={ROUTES.onboarding}>Empieza la entrevista</Link>}
            {done.scenario === "onboarded" && <Link href={ROUTES.dossier}>Abre el dossier</Link>}
            {done.scenario === "business" && <Link href={ROUTES.calls}>Abre las ayudas para tu empresa</Link>}
            {done.scenario === "pro" && done.applicationId && (
              <>
                <Link href={ROUTES.jury(done.applicationId)}>Abre el tribunal (61)</Link>
                {" · "}
                <Link href={ROUTES.justification(done.applicationId)}>Abre la justificación</Link>
                {done.callId && (
                  <>
                    {" · "}
                    <Link href={ROUTES.application(done.callId)}>Abre la solicitud</Link>
                  </>
                )}
              </>
            )}
            {done.panelMembers ? (
              <>
                {" · "}
                <Link href={ROUTES.panel}>Abre el panel ({done.panelMembers} miembros)</Link>
              </>
            ) : null}
          </p>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {status?.extras?.filter((x) => !x.ok).map((x) => (
          <p key={x.id} role="alert" className={styles.problem}>
            {x.id === "justification" ? "Justificación" : "Panel"} de ejemplo sin cargar: {x.problems.join(" · ")}
          </p>
        ))}
      </Card>

      <Card>
        <h2 className={styles.h2}>Foto de factura para la justificación</h2>
        <p className={styles.intro}>
          La factura que se fotografía en directo (ficticia, CC0). «Fotografiar una factura» abre la cámara, no la galería: lo más fiable es llevarla impresa en papel (A5) y hacerle la foto
          en escena, o apuntar la cámara a otra pantalla. Con la IA simulada, la primera foto sin nota (sea cual sea) se lee siempre igual: Imprenta Ártabra, 1.450,00 €, partida «Edición»,
          y se pasa de presupuesto.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SAMPLE_INVOICE_URL} alt="Factura de ejemplo de la Imprenta Ártabra, 1.450,00 euros" className={styles.invoice} />
        <p className={styles.download}>
          <a href={SAMPLE_INVOICE_URL} download="factura-ejemplo.png">Descargar la foto</a>
        </p>
      </Card>

      <Card>
        <h2 className={styles.h2}>Interruptores de plan B</h2>
        <p className={styles.intro}>Solo para esta cuenta. Se quedan como los dejes, aunque empieces de cero.</p>
        <Switch
          label="Tribunal determinista (plan B)"
          help="El tribunal deja de llamar a Claude y da siempre 61 en el primer borrador y 84 al aplicar todas las mejoras, con comentarios por criterio. Úsalo si el tribunal tarda o si quieres el 61 → 84 garantizado."
          checked={status?.settings.deterministicJury ?? false}
          disabled={!status || busy !== null}
          onChange={(v) => toggle("deterministicJury", v)}
        />
        <Switch
          label="IA simulada para esta cuenta"
          help="Toda la IA de esta cuenta (entrevista, fichas de obras, encaje con convocatorias, borrador y tribunal) usa respuestas simuladas: instantáneas y sin gastar la clave. Es menos lista: úsala solo si Claude no responde."
          checked={status?.settings.aiMock ?? false}
          disabled={!status || busy !== null || status.aiMode === "mock"}
          onChange={(v) => toggle("aiMock", v)}
        />
        {status?.aiMode === "mock" && <p className={styles.foot}>El servidor ya funciona con IA simulada (no hay clave de Anthropic).</p>}
      </Card>

      <Card>
        <h2 className={styles.h2}>Pantallas de la demo</h2>
        <div className={styles.links}>
          {screens(kind).map((l) => (
            <Link key={l.href} href={l.href} className="btn btn-secondary">
              {l.label}
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}

/** Quick links, following the active mode (a pyme never lands on the artist's "Obras" or dossier wording). */
export function screens(kind: "creator" | "business"): { href: string; label: string }[] {
  const common = [
    { href: ROUTES.home, label: "Portada" },
    { href: ROUTES.onboarding, label: kind === "business" ? "Hablar de tu empresa" : "Hablar / Alta" },
  ];
  const own =
    kind === "business"
      ? [
          { href: ROUTES.dossier, label: "Memoria de la empresa" },
          { href: ROUTES.calls, label: "Ayudas para tu empresa" },
        ]
      : [
          { href: ROUTES.works, label: "Obras" },
          { href: ROUTES.dossier, label: "Dossier" },
          { href: ROUTES.calls, label: "Convocatorias" },
        ];
  return [...common, ...own, { href: ROUTES.pricing, label: "Mecena Pro" }, { href: ROUTES.trust, label: "Confianza" }];
}

function Switch({ label, help, checked, disabled, onChange }: { label: string; help: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={styles.switch}>
      <label>
        <input type="checkbox" role="switch" aria-checked={checked} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
      <p>{help}</p>
    </div>
  );
}
