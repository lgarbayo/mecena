/**
 * Global daily ceiling on Claude requests (the AI runs on the owner's key): a safety net on top of the per-user
 * rate limits of every AI route (src/server/ai-limits.ts). Counted per day in Europe/Madrid, across every user and
 * background job, right before each request to the Anthropic API. Persisted in <MECENA_DATA_DIR>/ai-usage.json so a
 * restart (a deploy) does not refill it. MECENA_AI_DAILY_CAP overrides the default; 0 turns the ceiling off.
 */
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/server/store";

export const DEFAULT_AI_DAILY_CAP = 1500;

export function aiDailyCap(): number {
  const raw = process.env.MECENA_AI_DAILY_CAP?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_AI_DAILY_CAP;
}

const madridDay = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now);
const usageFile = () => path.join(dataDir(), "ai-usage.json");

/** On globalThis: Next bundles routes separately, and every route must count against the same ledger. */
const g = ((globalThis as unknown as Record<symbol, unknown>)[Symbol.for("mecena.ai-budget")] ??= { file: "", day: "", count: 0 }) as {
  file: string;
  day: string;
  count: number;
};

function load(day: string): void {
  const file = usageFile();
  if (g.file === file && g.day === day) return;
  let count = 0;
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { day?: unknown; count?: unknown };
    if (saved.day === day && typeof saved.count === "number" && saved.count >= 0) count = saved.count;
  } catch {
    // no file yet (or unreadable): a new day starts at 0
  }
  Object.assign(g, { file, day, count });
}

function save(): void {
  try {
    fs.mkdirSync(path.dirname(g.file), { recursive: true });
    const tmp = `${g.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ day: g.day, count: g.count }));
    fs.renameSync(tmp, g.file);
  } catch (e) {
    console.warn("[ai-budget] could not save the daily counter:", e instanceof Error ? e.message : e);
  }
}

/** Requests used today (for logs and tests). */
export function aiCallsToday(now = new Date()): number {
  load(madridDay(now));
  return g.count;
}

/**
 * Count one Claude request. Returns false, without counting, once today's ceiling is reached: the caller must not
 * send the request. Synchronous, so parallel requests cannot all slip under the ceiling.
 */
export function tryChargeAiCall(now = new Date()): boolean {
  const cap = aiDailyCap();
  load(madridDay(now));
  if (cap > 0 && g.count >= cap) return false;
  g.count++;
  save();
  return true;
}

/** Tests only: forget the in-memory counter (the file lives in each test's own data dir). */
export function resetAiBudget(): void {
  Object.assign(g, { file: "", day: "", count: 0 });
}
