/**
 * BDNS ingest (WP-05, fleet/DATA-PIPELINE.md §2). Public API, no key; rate-limits bursts (429).
 * 1. keyword/filter searches → 2. full record per hit (raw JSON cached in data/calls/raw/) →
 * 3. keep open, applicable calls for Galicia or all of Spain → 4. deterministic fields from the data
 * standard (bdnsToCallPatch) + Claude/mock structuring of the text (getAi().structureCall) → Call.parse →
 * 5. write <callsDir>/bdns-cache.json. Any network/API failure keeps the previous cache (never breaks the app).
 * The BDNS client (backoff on 429/5xx, raw-record cache) and the record → Call step are shared with the live,
 * per-profile catalogue in ./live.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { Call, serverEnv, type AiService } from "@/contracts";
import { bdnsToCallPatch, withCanonicalCallFields } from "@/features/normalize";

export interface BdnsDetail {
  codigoBDNS: string;
  descripcion: string;
  tipoConvocatoria?: string | null;
  organo?: { nivel1?: string | null; nivel2?: string | null; nivel3?: string | null } | null;
  regiones?: { descripcion?: string | null }[] | null;
  tiposBeneficiarios?: { descripcion?: string | null }[] | null;
  abierto?: boolean | null;
  fechaRecepcion?: string | null;
  fechaFinSolicitud?: string | null;
  textFin?: string | null;
  urlBasesReguladoras?: string | null;
  sedeElectronica?: string | null;
  descripcionFinalidad?: string | null;
  presupuestoTotal?: number | null;
  documentos?: { id: number; descripcion?: string | null; nombreFic?: string | null }[] | null;
  [k: string]: unknown;
}

/** One BDNS search: `descripcion`, `finalidad`, `regiones`… (ids from the BDNS catalogues, see data/calls/SOURCES.md). */
export type BdnsQuery = Record<string, string>;

/** Searches used by default: creators nationwide + Galicia, SMEs in Galicia (finalidad/regiones ids from BDNS catalogues). */
export const DEFAULT_QUERIES: BdnsQuery[] = [
  { finalidad: "11", regiones: "3" }, // cultura · Galicia
  { finalidad: "11", regiones: "1" }, // cultura · España
  { descripcion: "artes plásticas" },
  { descripcion: "ilustración" },
  { descripcion: "fotografía" },
  { descripcion: "creación artística" },
  { finalidad: "14", regiones: "3" }, // comercio, turismo y pymes · Galicia
  { finalidad: "6", regiones: "3" }, // fomento del empleo · Galicia
  { finalidad: "17", regiones: "3" }, // I+D+i · Galicia
];

export interface IngestOptions {
  fetchImpl?: typeof fetch;
  ai: Pick<AiService, "structureCall">;
  callsDir?: string;
  apiBase?: string;
  queries?: BdnsQuery[];
  since?: string; // dd/mm/yyyy, default 90 days ago
  maxCalls?: number;
  today?: string; // YYYY-MM-DD
  delayMs?: number;
  log?: (msg: string) => void;
}

export interface IngestResult {
  ok: boolean;
  written: number;
  kept: number; // previous cache size when ok=false
  skipped: { bdnsId: string; reason: string }[];
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ddmmyyyy = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

/** Direct awards / convenios / nominativas are pre-assigned to a named beneficiary: nobody can apply. */
export function isApplicable(d: Pick<BdnsDetail, "tipoConvocatoria" | "descripcion">): boolean {
  if (/concesi[oó]n directa|nominativ|convenio/i.test(`${d.tipoConvocatoria ?? ""} ${d.descripcion}`)) return false;
  return /concurrencia/i.test(d.tipoConvocatoria ?? "");
}

/** All of Spain (ES), no region at all, or inside one of `regions` (NUTS prefixes; default Galicia, ES11). */
export function isRelevantRegion(d: Pick<BdnsDetail, "regiones">, regions: readonly string[] = ["ES11"]): boolean {
  const codes = (d.regiones ?? []).map((r) => (r.descripcion ?? "").split(" - ")[0].trim());
  return codes.length === 0 || codes.some((c) => c === "ES" || regions.some((r) => c.startsWith(r)));
}

/** Open = flagged open, end date not passed, or a text-only deadline published in the last 60 days. */
export function isOpenish(d: BdnsDetail, today: string): boolean {
  if (d.abierto) return true;
  if (d.fechaFinSolicitud) return d.fechaFinSolicitud.slice(0, 10) >= today;
  const recent = new Date(Date.parse(today) - 60 * 864e5).toISOString().slice(0, 10);
  return Boolean(d.textFin) && (d.fechaRecepcion ?? "") >= recent;
}

/** Text Claude structures: the BDNS record has no criteria/documents, so `criteriaSource` stays "estimated" unless stated. */
export function recordText(d: BdnsDetail): string {
  return [
    `Título: ${d.descripcion}`,
    `Órgano: ${[d.organo?.nivel1, d.organo?.nivel2, d.organo?.nivel3].filter(Boolean).join(" / ")}`,
    `Tipo: ${d.tipoConvocatoria ?? ""}`,
    `Finalidad: ${d.descripcionFinalidad ?? ""}`,
    `Beneficiarios: ${(d.tiposBeneficiarios ?? []).map((b) => b.descripcion).join("; ")}`,
    `Regiones: ${(d.regiones ?? []).map((r) => r.descripcion).join("; ")}`,
    `Presupuesto total: ${d.presupuestoTotal ?? "no indicado"}`,
    `Plazo: ${d.fechaFinSolicitud ?? d.textFin ?? "no indicado"}`,
    `Documentos publicados: ${(d.documentos ?? []).map((x) => x.nombreFic ?? x.descripcion).join("; ")}`,
  ].join("\n");
}

export interface BdnsClientOptions {
  fetchImpl?: typeof fetch;
  apiBase?: string;
  /** Pause between requests and the base of the 429/5xx backoff (ms). */
  delayMs?: number;
  /** Where full records are cached as <code>.json (offline re-runs, no second download). */
  rawDir?: string;
  /** Per-request timeout (ms): a hung BDNS request must not hang a background job. */
  timeoutMs?: number;
  /** Re-download a cached record older than this (open/closed and dates change). Default: never (offline re-runs). */
  rawMaxAgeMs?: number;
}

/** BDNS REST client: retries 429/5xx with exponential backoff, caches full records on disk. */
export function createBdnsClient(opts: BdnsClientOptions = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const api = opts.apiBase ?? serverEnv().bdnsApiBase;
  const delay = opts.delayMs ?? 800;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  async function getJson<T>(url: string, attempt = 0): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      // network error or timeout: two more tries with backoff, then give up
      if (attempt >= 2) throw e;
      await sleep(delay * 2 ** (attempt + 1));
      return getJson(url, attempt + 1);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(delay * 2 ** (attempt + 1));
      return getJson(url, attempt + 1);
    }
    if (!res.ok) throw new Error(`BDNS ${res.status} ${url}`);
    return (await res.json()) as T;
  }

  return {
    api,
    /** BDNS codes matching one search (first page, 50 hits, published since `since` dd/mm/yyyy). */
    async search(q: BdnsQuery, since: string): Promise<string[]> {
      const params = new URLSearchParams({ vpd: "GE", page: "0", pageSize: "50", fechaDesde: since, ...q });
      const page = await getJson<{ content?: { numeroConvocatoria: string | number }[] }>(`${api}/convocatorias/busqueda?${params}`);
      await sleep(delay);
      return (page.content ?? []).map((it) => String(it.numeroConvocatoria));
    },
    /** One page of a search with titles (the national sweep filters on them before paying for the full record). */
    async searchPage(q: BdnsQuery, since: string, page: number, pageSize: number): Promise<{ hits: { code: string; title: string; organ: string }[]; last: boolean }> {
      const params = new URLSearchParams({ vpd: "GE", page: String(page), pageSize: String(pageSize), fechaDesde: since, ...q });
      const res = await getJson<{ content?: { numeroConvocatoria: string | number; descripcion?: string | null; nivel3?: string | null; nivel2?: string | null }[]; last?: boolean }>(
        `${api}/convocatorias/busqueda?${params}`,
      );
      await sleep(delay);
      const hits = (res.content ?? []).map((it) => ({ code: String(it.numeroConvocatoria), title: it.descripcion ?? "", organ: it.nivel3 ?? it.nivel2 ?? "" }));
      return { hits, last: res.last === true || hits.length < pageSize };
    },
    /** Full record, from the raw cache when present. */
    async detail(code: string): Promise<BdnsDetail> {
      const rawFile = opts.rawDir ? path.join(opts.rawDir, `${code}.json`) : undefined;
      if (rawFile && fs.existsSync(rawFile)) {
        const fresh = opts.rawMaxAgeMs === undefined || Date.now() - fs.statSync(rawFile).mtimeMs < opts.rawMaxAgeMs;
        if (fresh) {
          try {
            return JSON.parse(fs.readFileSync(rawFile, "utf8")) as BdnsDetail;
          } catch {
            // a torn or corrupt cache file: download it again below
          }
        }
      }
      const d = await getJson<BdnsDetail>(`${api}/convocatorias?numConv=${encodeURIComponent(code)}&vpd=GE`);
      if (rawFile) {
        fs.mkdirSync(path.dirname(rawFile), { recursive: true });
        const tmp = `${rawFile}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
        fs.renameSync(tmp, rawFile);
      }
      await sleep(delay);
      return d;
    },
  };
}

/**
 * One BDNS record → Call: Claude (or its mock) structures the text, then the deterministic BDNS fields win over the
 * model; residence stays what the text says (BDNS regiones = impact area, not residence). Marked `source: "bdns"`.
 */
export async function detailToCall(d: BdnsDetail, ai: Pick<AiService, "structureCall">, ctx: { apiBase: string; today: string }): Promise<Call> {
  const code = String(d.codigoBDNS);
  const sourceUrl = `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/${code}`;
  const structured = await ai.structureCall({ rawText: recordText(d), sourceUrl, bdnsId: code });
  const patch = bdnsToCallPatch(d);
  const call = Call.parse({
    ...structured,
    ...patch,
    id: `bdns-${code}`,
    organizer: patch.organizer ?? structured.organizer,
    disciplines: [...new Set([...patch.disciplines, ...structured.disciplines])],
    eligibility: { ...structured.eligibility, legalForms: patch.eligibility.legalForms.length ? patch.eligibility.legalForms : structured.eligibility.legalForms },
    amountText: structured.amountText && structured.amountText !== "Consultar bases" ? structured.amountText : patch.amountText,
    // Not yet accepting applications (opensAt after today) is "upcoming", never "open".
    status: patch.opensAt && patch.opensAt.slice(0, 10) > ctx.today ? "upcoming" : "open",
    sourceUrl,
    ...(d.documentos?.[0] ? { basesUrl: `${ctx.apiBase}/convocatorias/documentos?idDocumento=${d.documentos[0].id}` } : {}),
    source: "bdns",
    verifiedAt: ctx.today,
  });
  return withCanonicalCallFields(call);
}

function curatedBdnsIds(dir: string): Set<string> {
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(dir, "calls.json"), "utf8")) as { bdnsId?: string }[];
    return new Set(rows.map((r) => r.bdnsId).filter((x): x is string => Boolean(x)));
  } catch {
    return new Set();
  }
}

export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const env = serverEnv();
  const dir = path.resolve(opts.callsDir ?? env.callsDir);
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const since = opts.since ?? ddmmyyyy(new Date(Date.parse(today) - 90 * 864e5));
  const log = opts.log ?? (() => {});
  const cacheFile = path.join(dir, "bdns-cache.json");
  const client = createBdnsClient({ fetchImpl: opts.fetchImpl, apiBase: opts.apiBase, delayMs: opts.delayMs, rawDir: path.join(dir, "raw") });
  const previous = fs.existsSync(cacheFile) ? (JSON.parse(fs.readFileSync(cacheFile, "utf8")) as unknown[]).length : 0;

  try {
    const codes = new Set<string>();
    for (const q of opts.queries ?? DEFAULT_QUERIES) {
      const found = await client.search(q, since);
      found.forEach((c) => codes.add(c));
      log(`search ${JSON.stringify(q)}: ${found.length}`);
    }

    // Curated calls (calls.json) win over the ingest: their BDNS ids are skipped here.
    const curated = curatedBdnsIds(dir);
    const out: Call[] = [];
    const skipped: IngestResult["skipped"] = [];
    for (const code of codes) {
      if (out.length >= (opts.maxCalls ?? 30)) break;
      if (curated.has(code)) { skipped.push({ bdnsId: code, reason: "ya curada en calls.json" }); continue; }
      const d = await client.detail(code);
      if (!isApplicable(d)) { skipped.push({ bdnsId: code, reason: "no aplicable (concesión directa / convenio)" }); continue; }
      if (!isRelevantRegion(d)) { skipped.push({ bdnsId: code, reason: "fuera de Galicia / España" }); continue; }
      if (!isOpenish(d, today)) { skipped.push({ bdnsId: code, reason: "cerrada" }); continue; }

      try {
        out.push(await detailToCall({ ...d, codigoBDNS: code }, opts.ai, { apiBase: client.api, today }));
      } catch (e) {
        skipped.push({ bdnsId: code, reason: `no estructurable: ${e instanceof Error ? e.message.slice(0, 120) : e}` });
      }
    }

    // Never replace a good cache with an empty result (a flaky search must not wipe what the app already has).
    if (out.length === 0) {
      log(`nothing new found; keeping the previous cache (${previous} calls)`);
      return { ok: true, written: 0, kept: previous, skipped };
    }
    fs.writeFileSync(cacheFile, JSON.stringify(out, null, 2) + "\n");
    log(`wrote ${out.length} calls to ${cacheFile} (${skipped.length} skipped)`);
    return { ok: true, written: out.length, kept: 0, skipped };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`ingest failed, keeping previous cache (${previous} calls): ${error}`);
    return { ok: false, written: 0, kept: previous, skipped: [], error };
  }
}
