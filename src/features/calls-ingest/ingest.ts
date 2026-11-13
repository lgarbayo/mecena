/**
 * BDNS ingest (WP-05, fleet/DATA-PIPELINE.md §2). Public API, no key; rate-limits bursts (429).
 * 1. keyword/filter searches → 2. full record per hit (raw JSON cached in data/calls/raw/) →
 * 3. keep open, applicable calls for Galicia or all of Spain → 4. deterministic fields from the data
 * standard (bdnsToCallPatch) + Claude/mock structuring of the text (getAi().structureCall) → Call.parse →
 * 5. write <callsDir>/bdns-cache.json. Any network/API failure keeps the previous cache (never breaks the app).
 */
import fs from "node:fs";
import path from "node:path";
import { Call, serverEnv, type AiService } from "@/contracts";
import { bdnsToCallPatch } from "@/features/normalize";

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

/** Searches used by default: creators nationwide + Galicia, SMEs in Galicia (finalidad/regiones ids from BDNS catalogues). */
export const DEFAULT_QUERIES: Record<string, string>[] = [
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
  queries?: Record<string, string>[];
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

/** Galicia (ES11…), all of Spain (ES) or no region at all. */
export function isRelevantRegion(d: Pick<BdnsDetail, "regiones">): boolean {
  const codes = (d.regiones ?? []).map((r) => (r.descripcion ?? "").split(" - ")[0].trim());
  return codes.length === 0 || codes.some((c) => c === "ES" || c.startsWith("ES11"));
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

export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const env = serverEnv();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const dir = path.resolve(opts.callsDir ?? env.callsDir);
  const api = opts.apiBase ?? env.bdnsApiBase;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const since = opts.since ?? ddmmyyyy(new Date(Date.parse(today) - 90 * 864e5));
  const delay = opts.delayMs ?? 800;
  const log = opts.log ?? (() => {});
  const cacheFile = path.join(dir, "bdns-cache.json");
  const rawDir = path.join(dir, "raw");
  const previous = fs.existsSync(cacheFile) ? (JSON.parse(fs.readFileSync(cacheFile, "utf8")) as unknown[]).length : 0;

  async function getJson<T>(url: string, attempt = 0): Promise<T> {
    const res = await fetchImpl(url, { headers: { accept: "application/json" } });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(delay * 2 ** (attempt + 1));
      return getJson(url, attempt + 1);
    }
    if (!res.ok) throw new Error(`BDNS ${res.status} ${url}`);
    return (await res.json()) as T;
  }

  try {
    const codes = new Set<string>();
    for (const q of opts.queries ?? DEFAULT_QUERIES) {
      const params = new URLSearchParams({ vpd: "GE", page: "0", pageSize: "50", fechaDesde: since, ...q });
      const page = await getJson<{ content: { numeroConvocatoria: string }[] }>(`${api}/convocatorias/busqueda?${params}`);
      for (const it of page.content ?? []) codes.add(String(it.numeroConvocatoria));
      log(`search ${JSON.stringify(q)}: ${page.content?.length ?? 0}`);
      await sleep(delay);
    }

    fs.mkdirSync(rawDir, { recursive: true });
    const out: Call[] = [];
    const skipped: IngestResult["skipped"] = [];
    for (const code of codes) {
      if (out.length >= (opts.maxCalls ?? 30)) break;
      const rawFile = path.join(rawDir, `${code}.json`);
      let d: BdnsDetail;
      if (fs.existsSync(rawFile)) d = JSON.parse(fs.readFileSync(rawFile, "utf8"));
      else {
        d = await getJson<BdnsDetail>(`${api}/convocatorias?numConv=${encodeURIComponent(code)}&vpd=GE`);
        fs.writeFileSync(rawFile, JSON.stringify(d, null, 2));
        await sleep(delay);
      }
      if (!isApplicable(d)) { skipped.push({ bdnsId: code, reason: "no aplicable (concesión directa / convenio)" }); continue; }
      if (!isRelevantRegion(d)) { skipped.push({ bdnsId: code, reason: "fuera de Galicia / España" }); continue; }
      if (!isOpenish(d, today)) { skipped.push({ bdnsId: code, reason: "cerrada" }); continue; }

      const sourceUrl = `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias/${code}`;
      try {
        const ai = await opts.ai.structureCall({ rawText: recordText(d), sourceUrl, bdnsId: code });
        const patch = bdnsToCallPatch(d);
        // Deterministic BDNS fields win over the model; residence stays what the text says (BDNS regiones = impact area, not residence).
        const call = Call.parse({
          ...ai,
          ...patch,
          id: `bdns-${code}`,
          organizer: patch.organizer ?? ai.organizer,
          disciplines: [...new Set([...patch.disciplines, ...ai.disciplines])],
          eligibility: { ...ai.eligibility, legalForms: patch.eligibility.legalForms.length ? patch.eligibility.legalForms : ai.eligibility.legalForms },
          amountText: ai.amountText && ai.amountText !== "Consultar bases" ? ai.amountText : patch.amountText,
          status: "open",
          sourceUrl,
          ...(d.documentos?.[0] ? { basesUrl: `${api}/convocatorias/documentos?idDocumento=${d.documentos[0].id}` } : {}),
          source: "bdns",
          verifiedAt: today,
        });
        out.push(call);
      } catch (e) {
        skipped.push({ bdnsId: code, reason: `no estructurable: ${e instanceof Error ? e.message.slice(0, 120) : e}` });
      }
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
