/**
 * Daily refresh of the shared BDNS catalogue, in process (started from src/instrumentation.ts).
 *
 * Why in process and not a GitHub Actions cron hitting an endpoint: Mecena runs on exactly one always-on Fly machine
 * (auto_stop_machines = "off", min_machines_running = 1) that owns the volume the catalogue lives on. A timer in the
 * server needs no public endpoint, no shared secret and no second system, and it cannot hit the wrong machine. The
 * last refresh time is persisted on the volume, so restarts and deploys neither skip a day nor refresh twice: every
 * hour the server checks whether 23 h have passed and catches up right after a boot if needed.
 */
import { getAi } from "@/server/ai";
import { catalogRefreshedAt, liveCatalogEnabled, refreshCatalog } from "./live";

const CHECK_EVERY_MS = 3600e3;
const FIRST_CHECK_MS = 90_000; // let the server finish booting first
const REFRESH_AFTER_MS = 23 * 3600e3;

let inProgress = false;

/** Refresh if the last successful one is older than 23 h. Returns whether a refresh ran. Never throws. */
export async function refreshIfDue(now = Date.now(), run: typeof refreshCatalog = refreshCatalog): Promise<boolean> {
  if (inProgress) return false;
  const last = catalogRefreshedAt();
  if (last && now - Date.parse(last) < REFRESH_AFTER_MS) return false;
  inProgress = true;
  try {
    const r = await run({ ai: getAi(), log: (m) => console.log(`[calls-refresh] ${m}`) });
    console.log(`[calls-refresh] ${r.ok ? "done" : `failed (${r.error})`}: ${r.queries} queries, ${r.found.length} found, ${r.structured} structured, ${r.pruned} pruned`);
    return true;
  } catch (e) {
    console.warn("[calls-refresh] unexpected error, catalogue untouched:", e instanceof Error ? e.message : e);
    return false;
  } finally {
    inProgress = false;
  }
}

const KEY = Symbol.for("mecena.callsRefreshScheduler");

/** Start the hourly check once per process (dev reloads call register() again). */
export function startCallsRefreshScheduler(): boolean {
  if (!liveCatalogEnabled()) return false;
  const g = globalThis as unknown as Record<symbol, boolean>;
  if (g[KEY]) return false;
  g[KEY] = true;
  setTimeout(() => void refreshIfDue(), FIRST_CHECK_MS).unref?.();
  setInterval(() => void refreshIfDue(), CHECK_EVERY_MS).unref?.();
  console.log("[calls-refresh] scheduler started (checks hourly, refreshes every ~24 h)");
  return true;
}
