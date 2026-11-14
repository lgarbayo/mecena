"use client";
/**
 * /demo: plan-B panel for the stage. Everything acts on the signed-in account only (nobody else's data is touched):
 * start from scratch, load a ready-made scenario, and the per-account switches (deterministic jury, simulated AI).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API, ROUTES } from "@/contracts";
import type { z } from "zod";
import type { DemoResetResponse } from "@/contracts/api";
import { Button, Card, Tag } from "@/components/ui";
import { useApp } from "@/components/shell/AppProvider";
import { apiGet, apiSend, ApiClientError } from "@/lib/api-client";
import type { DemoStatus } from "../status";

type Scenario = "blank" | "onboarded" | "pro" | "business";
type ResetResult = z.infer<typeof DemoResetResponse>;

export const SCENARIOS: { id: Scenario; title: string; what: string; when: string; confirm: string }[] = [
  {
    id: "blank",
    title: "Empezar de cero",
    what: "Borra tu perfil, tus obras, tu dossier y tus solicitudes. Te deja una creadora en blanco y vuelve a salir la oferta de Mecena Pro.",
    when: "Antes de salir al escenario, para hacer la entrevista en directo.",
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
    what: "La artista de ejemplo con Mecena Pro de demo y una solicitud ya redactada para una convocatoria abierta, puntuada 61 por el tribunal. «Aplicar mejoras» la sube a 84. Activa también el tribunal determinista.",
    when: "Si la compra de RevenueCat falla o tarda, o si el borrador o el tribunal tardan más de 8 segundos.",
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
    if (!window.confirm(s.confirm)) return;
    setBusy(s.id);
    setError("");
    setDone(null);
    try {
      const r = await apiSend<ResetResult>(API.demoReset, { scenario: s.id, withBusiness });
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
    setBusy("settings");
    setError("");
    try {
      setStatus(await apiSend<DemoStatus>(API.demoSettings, { [key]: value }));
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
        <p style={{ marginTop: 0, color: "var(--g-ink-2)" }}>
          Todo lo que hagas aquí afecta solo a la cuenta <strong>{email}</strong>. Las demás cuentas no se tocan.
        </p>
        {status && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }} aria-label="Estado de la cuenta">
            <Tag tone={status.effectiveAiMode === "mock" ? "warn" : "ok"}>IA: {status.effectiveAiMode === "mock" ? "simulada" : "Claude"}</Tag>
            <Tag tone={status.settings.deterministicJury ? "warn" : "neutral"}>Tribunal: {status.settings.deterministicJury ? "determinista" : "Claude"}</Tag>
            <Tag tone={status.purchasesMode === "mock" ? "warn" : "ok"}>Pagos: {status.purchasesMode === "mock" ? "modo prueba" : "RevenueCat sandbox"}</Tag>
            <Tag tone={status.pro ? "accent" : "neutral"}>{status.pro ? (status.proIsDemoGrant ? "Pro (demo)" : "Pro") : "Gratis"}</Tag>
            <Tag>Modo: {kind === "business" ? "Pyme" : "Creador/a"}</Tag>
          </div>
        )}
        {status && (
          <p style={{ fontSize: "0.85rem", color: "var(--g-ink-2)", marginBottom: 0 }}>
            Cliente de RevenueCat: <code>{status.appUserId}</code> · Convocatorias abiertas: {status.openCalls.creator} para artistas, {status.openCalls.business} para pymes
          </p>
        )}
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Escenarios</h2>
        <p style={{ color: "var(--g-ink-2)" }}>Cada botón borra tus datos y deja la cuenta lista en un toque. Te pedirá confirmación.</p>
        <div style={{ display: "grid", gap: "14px" }}>
          {SCENARIOS.map((s) => {
            const check = status?.scenarios.find((c) => c.scenario === s.id);
            const locked = s.id === "pro" && proLocked;
            return (
              <div key={s.id} style={{ borderTop: "1px solid var(--g-line, #ddd)", paddingTop: "12px" }}>
                <Button variant={s.id === "blank" ? "primary" : "ghost"} onClick={() => run(s)} disabled={busy !== null || locked || check?.ok === false}>
                  {busy === s.id ? "Cargando…" : s.title}
                </Button>
                <p style={{ margin: "8px 0 2px" }}>{s.what}</p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--g-ink-2)" }}>
                  <strong>Cuándo:</strong> {s.when}
                </p>
                {s.id === "blank" && (
                  <label style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={withBusiness} onChange={(e) => setWithBusiness(e.target.checked)} />
                    Dejar la pyme de ejemplo para el cambio a Pyme
                  </label>
                )}
                {locked && (
                  <p role="note" style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>
                    Solo para las cuentas de demo: el servidor tiene que tener tu email en <code>DEMO_EMAILS</code>. Así no se salta la verificación real de RevenueCat.
                  </p>
                )}
                {check && !check.ok && (
                  <p role="alert" style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>
                    No se puede cargar: {check.problems.join(" · ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {done && (
          <p role="status" style={{ marginBottom: 0 }}>
            Listo.{" "}
            {done.scenario === "blank" && <Link href={ROUTES.onboarding}>Empieza la entrevista</Link>}
            {done.scenario === "onboarded" && <Link href={ROUTES.dossier}>Abre el dossier</Link>}
            {done.scenario === "business" && <Link href={ROUTES.calls}>Abre las ayudas para tu empresa</Link>}
            {done.scenario === "pro" && done.applicationId && (
              <>
                <Link href={ROUTES.jury(done.applicationId)}>Abre el tribunal (61)</Link>
                {done.callId && (
                  <>
                    {" · "}
                    <Link href={ROUTES.application(done.callId)}>Abre la solicitud</Link>
                  </>
                )}
              </>
            )}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Interruptores de plan B</h2>
        <p style={{ color: "var(--g-ink-2)" }}>Solo para esta cuenta. Se quedan como los dejes, aunque empieces de cero.</p>
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
        {status?.aiMode === "mock" && <p style={{ fontSize: "0.85rem", marginBottom: 0 }}>El servidor ya funciona con IA simulada (no hay clave de Anthropic).</p>}
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Pantallas de la demo</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {screens(kind).map((l) => (
            <Link key={l.href} href={l.href} className="btn btn-ghost">
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
    <div style={{ marginBottom: "14px" }}>
      <label style={{ display: "flex", gap: "10px", alignItems: "center", fontWeight: 600 }}>
        <input type="checkbox" role="switch" aria-checked={checked} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
      <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--g-ink-2)" }}>{help}</p>
    </div>
  );
}
