// Demo preflight: is the deployed app ready for the stage? Owned by WP-09.
//
//   MECENA_DEMO_EMAIL=… MECENA_DEMO_PASSWORD=… npm run demo:preflight [-- <url>] [--load <scenario>] [--allow-ai]
//
// <url> defaults to https://mecena.fly.dev (or PREFLIGHT_URL). Optional PREFLIGHT_BASIC_AUTH=user:pass when the
// deployment is behind Basic auth. Exit code 0 = all green, 1 = something red.
//
// Harmless by default: GETs, one login, and the account's own «IA simulada» switch turned on while it reads the feed
// and back to how it was at the end (so no Anthropic spend). It never changes data unless you pass --load <scenario>
// (blank | onboarded | pro | business), which wipes THAT account and loads the scenario (then checks it: Pro, the
// application and its 61 jury score, the tribunal page). Use it on the stage account before going on stage.

type Status = "ok" | "fail" | "warn" | "info";
interface Line {
  status: Status;
  name: string;
  detail: string;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--load"));
const BASE = (positional[0] ?? process.env.PREFLIGHT_URL ?? "https://mecena.fly.dev").replace(/\/$/, "");
const EMAIL = process.env.MECENA_DEMO_EMAIL ?? "";
const PASSWORD = process.env.MECENA_DEMO_PASSWORD ?? "";
const LOAD = opt("load");
const ALLOW_AI = flag("allow-ai");
const SCENARIOS = ["blank", "onboarded", "pro", "business"];

const lines: Line[] = [];
const report = (status: Status, name: string, detail = "") => {
  lines.push({ status, name, detail });
  const icon = { ok: "\x1b[32m✔\x1b[0m", fail: "\x1b[31m✘\x1b[0m", warn: "\x1b[33m!\x1b[0m", info: "\x1b[36mi\x1b[0m" }[status];
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
};

let cookie = "";
const basic = process.env.PREFLIGHT_BASIC_AUTH ? `Basic ${Buffer.from(process.env.PREFLIGHT_BASIC_AUTH).toString("base64")}` : undefined;

async function http(path: string, init: { method?: string; body?: unknown; redirect?: RequestRedirect } = {}) {
  const headers: Record<string, string> = { accept: "application/json, text/html, application/pdf", origin: BASE };
  if (cookie) headers.cookie = cookie;
  if (basic) headers.authorization = basic;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    redirect: init.redirect ?? "manual",
    signal: AbortSignal.timeout(30_000),
  });
  return { res, ms: Date.now() - started };
}

async function jsonOf<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T;
  } catch {
    return undefined;
  }
}

/** Run one check; any exception is a red line, never a crash of the whole preflight. */
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    report("fail", name, e instanceof Error ? e.message : String(e));
  }
}

interface DemoStatus {
  email: string;
  appUserId: string;
  activeProfileKind: string | null;
  settings: { deterministicJury: boolean; aiMock: boolean };
  aiMode: string;
  effectiveAiMode: string;
  purchasesMode: string;
  revenueCatVerified: boolean;
  demoAccount: boolean;
  canLoadPro: boolean;
  pro: boolean;
  proIsDemoGrant: boolean;
  openCalls: { creator: number; business: number };
  scenarios: { scenario: string; ok: boolean; problems: string[]; callId?: string }[];
}

async function main() {
  console.log(`Mecena · preflight de la demo contra ${BASE}\n`);
  if (!EMAIL || !PASSWORD) {
    report("fail", "Credenciales", "faltan MECENA_DEMO_EMAIL y MECENA_DEMO_PASSWORD");
    return;
  }
  if (LOAD && !SCENARIOS.includes(LOAD)) {
    report("fail", "--load", `escenario desconocido «${LOAD}» (usa ${SCENARIOS.join(", ")})`);
    return;
  }

  await check("Servidor y /api/auth/config", async () => {
    const { res, ms } = await http("/api/auth/config");
    const body = await jsonOf<{ signupCodeRequired: boolean }>(res);
    if (res.status !== 200 || !body) throw new Error(`HTTP ${res.status}`);
    report("ok", "Servidor y /api/auth/config", `${ms} ms · alta ${body.signupCodeRequired ? "con código de invitación" : "abierta"}`);
  });

  for (const p of ["/api/health", "/api/healthz"]) {
    const r = await http(p).catch(() => undefined);
    if (r?.res.status === 200) {
      report("ok", `Health check ${p}`, `${r.ms} ms`);
      break;
    }
  }

  await check("Login de la cuenta de demo", async () => {
    const { res, ms } = await http("/api/auth/login", { body: { email: EMAIL, password: PASSWORD } });
    const set = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
    cookie = set
      .map((c) => c.split(";")[0])
      .filter((c) => c.includes("="))
      .join("; ");
    if (res.status === 429) throw new Error("demasiados intentos (límite por email o IP): espera 15 min o usa la cuenta de reserva");
    if (res.status !== 200 || !cookie) throw new Error(`HTTP ${res.status}: ${(await jsonOf<{ message: string }>(res))?.message ?? ""}`);
    report("ok", "Login de la cuenta de demo", `${EMAIL} · ${ms} ms (no hagas logout en el móvil después)`);
  });
  if (!cookie) return;

  let status: DemoStatus | undefined;
  await check("Panel de demo (/api/demo/settings)", async () => {
    const { res } = await http("/api/demo/settings");
    status = await jsonOf<DemoStatus>(res);
    if (res.status !== 200 || !status) throw new Error(`HTTP ${res.status} (¿está desplegado el panel de demo?)`);
    report(status.aiMode === "anthropic" ? "ok" : "warn", "IA del servidor", status.aiMode === "anthropic" ? "Claude (clave del dueño)" : "SIMULADA: falta ANTHROPIC_API_KEY o MECENA_AI_MOCK=1");
    report(status.purchasesMode === "revenuecat" ? "ok" : "warn", "Pagos", status.purchasesMode === "revenuecat" ? "RevenueCat sandbox" : "modo prueba (sin clave pública de RevenueCat)");
    report(status.revenueCatVerified ? "ok" : "warn", "Verificación de compras", status.revenueCatVerified ? "REST con REVENUECAT_SECRET_API_KEY" : "sin clave secreta: el servidor confía en el cliente");
    report(status.canLoadPro ? "ok" : "warn", "Escenario Pro disponible", status.demoAccount ? "cuenta en DEMO_EMAILS" : status.canLoadPro ? "pagos simulados" : "esta cuenta no está en DEMO_EMAILS: el plan B Pro no cargará");
    for (const s of status.scenarios) report(s.ok ? "ok" : "fail", `Escenario «${s.scenario}» listo`, s.ok ? (s.callId ? `solicitud para ${s.callId}` : "") : s.problems.join(" · "));
    report("info", "Interruptores de la cuenta", `tribunal ${status.settings.deterministicJury ? "determinista" : "según la IA"} · «IA simulada para esta cuenta» ${status.settings.aiMock ? "activada" : "desactivada"} · ${status.pro ? (status.proIsDemoGrant ? "Pro (demo)" : "Pro") : "gratis"} · modo ${status.activeProfileKind ?? "?"}`);
  });

  await check("Entitlement (/api/entitlements)", async () => {
    const { res } = await http("/api/entitlements");
    const body = await jsonOf<{ entitlement: { pro: boolean; premiumCredits: number; source: string } }>(res);
    if (res.status !== 200 || !body) throw new Error(`HTTP ${res.status}`);
    report("ok", "Entitlement (/api/entitlements)", `${body.entitlement.pro ? "Pro" : "gratis"} · créditos ${body.entitlement.premiumCredits} · ${body.entitlement.source}`);
  });

  // From here on the account may call AI (feed, scenario scoring): keep it on mocks unless --allow-ai.
  const restoreAiMock = status?.settings.aiMock;
  const mockOn = !ALLOW_AI && status && !status.settings.aiMock && status.aiMode === "anthropic";
  if (mockOn) {
    const { res } = await http("/api/demo/settings", { body: { aiMock: true } });
    if (res.status !== 200) report("warn", "IA simulada temporal", `HTTP ${res.status}: las comprobaciones siguientes pueden gastar IA`);
  }

  try {
    let applicationId: string | undefined;
    if (LOAD) {
      await check(`Cargar escenario «${LOAD}»`, async () => {
        const { res, ms } = await http("/api/demo/reset", { body: { scenario: LOAD, withBusiness: true } });
        const body = await jsonOf<{ scenario: string; pro: boolean; applicationId?: string; callId?: string; message?: string }>(res);
        if (res.status !== 200 || !body) throw new Error(`HTTP ${res.status}: ${body?.message ?? ""}`);
        applicationId = body.applicationId;
        report(ms < 10_000 ? "ok" : "warn", `Cargar escenario «${LOAD}»`, `${ms} ms${body.callId ? ` · solicitud para ${body.callId}` : ""}`);
        if (LOAD === "pro") {
          if (!body.pro || !applicationId) throw new Error("no ha quedado Pro con solicitud");
          const jury = await http(`/api/jury?applicationId=${encodeURIComponent(applicationId)}`);
          const j = await jsonOf<{ score: { total: number } | null }>(jury.res);
          report(j?.score?.total === 61 ? "ok" : "fail", "Tribunal de la solicitud de ejemplo", `nota ${j?.score?.total ?? "—"} (esperado 61; «Aplicar mejoras» → 84)`);
          const ent = await jsonOf<{ entitlement: { pro: boolean } }>((await http("/api/entitlements")).res);
          report(ent?.entitlement.pro ? "ok" : "fail", "Pro de demo activo", ent?.entitlement.pro ? "sí" : "no");
        }
      });
    }

    let firstOpenId: string | undefined;
    await check("Convocatorias (/api/calls)", async () => {
      const { res, ms } = await http("/api/calls");
      const body = await jsonOf<{ results: { call: { id: string; status: string; deadline: string | null } }[]; lockedCount: number; mode: string }>(res);
      if (res.status !== 200 || !body) throw new Error(`HTTP ${res.status}`);
      const today = new Date().toISOString().slice(0, 10);
      const open = body.results.filter((r) => r.call.status === "open" && (!r.call.deadline || r.call.deadline >= today));
      const expired = body.results.filter((r) => r.call.status === "open" && r.call.deadline && r.call.deadline < today);
      firstOpenId = open[0]?.call.id;
      if (!open.length) throw new Error(`ninguna convocatoria abierta en el feed (${body.results.length} resultados, modo ${body.mode})`);
      report("ok", "Convocatorias (/api/calls)", `${open.length} abiertas visibles + ${body.lockedCount} bloqueadas · modo ${body.mode} · ${ms} ms`);
      if (expired.length) report("warn", "Plazos vencidos en el feed", expired.map((r) => r.call.id).join(", "));
    });

    await check("PDF del dossier", async () => {
      const { res, ms } = await http("/api/dossier/pdf?download=1");
      const bytes = Buffer.from(await res.arrayBuffer());
      const type = res.headers.get("content-type") ?? "";
      if (res.status !== 200 || !type.includes("application/pdf")) throw new Error(`HTTP ${res.status} ${type}`);
      if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("no empieza por %PDF-");
      if (!bytes.subarray(-1024).toString("latin1").includes("%%EOF")) throw new Error("PDF truncado (sin %%EOF)");
      const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      report(ms < 5_000 ? "ok" : "warn", "PDF del dossier", `${(bytes.length / 1024).toFixed(0)} KB · ${pages || "?"} páginas · ${ms} ms`);
    });

    const pages = ["/", "/onboarding", "/obras", "/dossier", "/convocatorias", "/pro", "/confianza", "/demo", "/entrar"];
    if (firstOpenId) pages.push(`/convocatorias/${encodeURIComponent(firstOpenId)}`);
    if (applicationId) pages.push(`/tribunal/${encodeURIComponent(applicationId)}`);
    const bad: string[] = [];
    const slow: string[] = [];
    for (const p of pages) {
      try {
        const { res, ms } = await http(p);
        if (res.status >= 500 || res.status === 404) bad.push(`${p} → ${res.status}`);
        else if (res.status >= 300 && res.status < 400 && p !== "/entrar") bad.push(`${p} → ${res.status} ${res.headers.get("location") ?? ""} (¿sesión perdida?)`);
        if (ms > 4_000) slow.push(`${p} ${ms} ms`);
      } catch (e) {
        bad.push(`${p} → ${e instanceof Error ? e.message : e}`);
      }
    }
    report(bad.length ? "fail" : "ok", `Páginas sin 500 (${pages.length})`, bad.join(" · "));
    if (slow.length) report("warn", "Páginas lentas", slow.join(" · "));
  } finally {
    if (mockOn) {
      const { res } = await http("/api/demo/settings", { body: { aiMock: restoreAiMock ?? false } });
      report(res.status === 200 ? "info" : "warn", "IA simulada temporal", res.status === 200 ? "restaurada como estaba" : `no se pudo restaurar (HTTP ${res.status}): revísalo en /demo`);
    }
  }
}

main()
  .catch((e) => report("fail", "Preflight", e instanceof Error ? e.message : String(e)))
  .finally(() => {
    const fails = lines.filter((l) => l.status === "fail").length;
    const warns = lines.filter((l) => l.status === "warn").length;
    console.log(fails ? `\n\x1b[41m ROJO \x1b[0m ${fails} fallo(s), ${warns} aviso(s)` : `\n\x1b[42m VERDE \x1b[0m ${warns} aviso(s)`);
    process.exitCode = fails ? 1 : 0;
  });
