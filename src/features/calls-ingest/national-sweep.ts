/**
 * National BDNS sweep (see ./sweep.ts for the filters): search every comunidad for calls an individual creator can
 * apply to, keep the plausible titles, read their full record, and only then structure them with Claude into the
 * shared live catalogue. The same caps as every other run apply (`maxNew` per run, MAX_STRUCTURED_PER_DAY per day).
 */
import type { AiService } from "@/contracts";
import { createBdnsClient } from "./ingest";
import { ingestIntoCatalog, type CatalogIngestResult } from "./live";
import { openToCreators, sweepCandidates, SWEEP_QUERIES, type SweepHit, type SweepStats } from "./sweep";

export interface NationalSweepOptions {
  ai: Pick<AiService, "structureCall">;
  /** Claude structurings allowed in this run (the owner's AI spend). */
  maxNew: number;
  /** Read and filter everything, but do not call Claude nor write the catalogue. */
  dryRun?: boolean;
  /** BDNS full records to read at most (each is one request); the rest wait for the next run. Default 600. */
  maxCandidates?: number;
  queries?: typeof SWEEP_QUERIES;
  fetchImpl?: typeof fetch;
  apiBase?: string;
  delayMs?: number;
  today?: string;
  /** dd/mm/yyyy, default 90 days before `today`. */
  since?: string;
  log?: (msg: string) => void;
}

export interface NationalSweepResult {
  ok: boolean;
  stats: SweepStats;
  /** Titles that passed the cheap filter, in the order they were read. */
  candidates: SweepHit[];
  /** The detail-level result (skips by reason, what was or would be structured); null when no search worked. */
  ingest: CatalogIngestResult | null;
  error?: string;
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Never throws: a BDNS or network failure ends the run with `ok: false` and the catalogue untouched. */
export async function runNationalSweep(opts: NationalSweepOptions): Promise<NationalSweepResult> {
  const log = opts.log ?? (() => {});
  const day = opts.today ?? new Date().toISOString().slice(0, 10);
  const since = opts.since ?? ddmmyyyy(new Date(Date.parse(day) - 90 * 864e5).toISOString().slice(0, 10));
  const client = createBdnsClient({ fetchImpl: opts.fetchImpl, apiBase: opts.apiBase, delayMs: opts.delayMs });

  const { candidates, stats } = await sweepCandidates(client, { since, queries: opts.queries, log });
  log(`${stats.seen} BDNS records found, ${stats.kept} pass the title filter`);
  if (stats.seen === 0) return { ok: false, stats, candidates, ingest: null, error: "BDNS no devolvió ninguna convocatoria" };

  const picked = candidates.slice(0, opts.maxCandidates ?? 600);
  // "ES" matches every NUTS code (all of Spain); "XXXX" is BDNS "todo el mundo".
  const ingest = await ingestIntoCatalog({
    queries: [],
    candidates: picked.map((c) => ({ code: c.code, regions: ["ES", "XXXX"] })),
    accept: (d) => {
      const r = openToCreators(d);
      return r.ok ? null : r.reason;
    },
    dryRun: opts.dryRun,
    ai: opts.ai,
    maxNew: opts.maxNew,
    fetchImpl: opts.fetchImpl,
    apiBase: opts.apiBase,
    delayMs: opts.delayMs,
    today: day,
    since,
    log,
  });
  return { ok: ingest.ok, stats, candidates: picked, ingest, ...(ingest.error ? { error: ingest.error } : {}) };
}
