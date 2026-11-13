/** Data-quality report over a call dataset (WP-05 runs it at ingest and in its dataset test). */
import { Call } from "@/contracts/domain";
import { normalizeCall, type NormalizeCallOptions } from "./call";
import { ccaaOf } from "./territory";
import { type CanonicalCall, type DataWarning, warn } from "./types";

export interface CallQuality {
  id: string;
  warnings: DataWarning[];
  canonical?: CanonicalCall;
}

export interface QualityReport {
  total: number;
  valid: number; // pass Call.safeParse
  invalid: { index: number; id?: string; issues: string[] }[];
  errors: number; // calls with ≥1 error-severity warning
  clean: number; // valid calls with no warning of severity warning/error
  byCode: Record<string, number>;
  coverage: {
    withDeadline: number;
    estimatedDeadline: number;
    rolling: number;
    withAmount: number;
    criteriaSum100: number; // calls whose raw maxPoints already sum to 100
    withCriteria: number;
    stateWide: number;
    byCcaa: Record<string, number>; // NUTS2 → calls restricted to it (or inside it)
    byBeneficiary: Record<string, number>;
  };
  calls: CallQuality[];
}

/**
 * validateCallDataset(calls) → report. Accepts unknown input (raw JSON), validates against the Call
 * contract, normalises each valid call, and aggregates warnings and coverage.
 */
export function validateCallDataset(calls: readonly unknown[], opts: { publicationDates?: Record<string, string> } = {}): QualityReport {
  const report: QualityReport = {
    total: calls.length,
    valid: 0,
    invalid: [],
    errors: 0,
    clean: 0,
    byCode: {},
    coverage: { withDeadline: 0, estimatedDeadline: 0, rolling: 0, withAmount: 0, criteriaSum100: 0, withCriteria: 0, stateWide: 0, byCcaa: {}, byBeneficiary: {} },
    calls: [],
  };
  const seenIds = new Map<string, number>();
  const seenBdns = new Map<string, string>();

  calls.forEach((raw, index) => {
    const parsed = Call.safeParse(raw);
    if (!parsed.success) {
      const id = typeof raw === "object" && raw && "id" in raw ? String((raw as { id: unknown }).id) : undefined;
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      report.invalid.push({ index, id, issues });
      report.calls.push({ id: id ?? `#${index}`, warnings: [warn("invalid-record", "", `No cumple el contrato Call: ${issues.slice(0, 3).join("; ")}`, undefined, "error")] });
      return;
    }
    report.valid++;
    const call = parsed.data;
    const nOpts: NormalizeCallOptions = opts.publicationDates?.[call.id] ? { publicationDate: opts.publicationDates[call.id] } : {};
    const { value, warnings } = normalizeCall(call, nOpts);

    if (seenIds.has(call.id)) warnings.push(warn("duplicate-id", "id", `Id repetido (también en la posición ${seenIds.get(call.id)})`, call.id, "error"));
    seenIds.set(call.id, index);
    if (call.bdnsId) {
      if (seenBdns.has(call.bdnsId)) warnings.push(warn("duplicate-id", "bdnsId", `Misma convocatoria BDNS que «${seenBdns.get(call.bdnsId)}»`, call.bdnsId, "error"));
      seenBdns.set(call.bdnsId, call.id);
    }

    for (const w of warnings) report.byCode[w.code] = (report.byCode[w.code] ?? 0) + 1;
    if (warnings.some((w) => w.severity === "error")) report.errors++;
    if (!warnings.some((w) => w.severity !== "info")) report.clean++;

    const c = report.coverage;
    if (value.deadline.date) c.withDeadline++;
    if (value.deadline.estimated) c.estimatedDeadline++;
    if (value.deadline.method === "rolling") c.rolling++;
    if (Object.keys(value.amount).length) c.withAmount++;
    if (call.criteria.length) c.withCriteria++;
    if (call.criteria.length && call.criteria.reduce((a, x) => a + x.maxPoints, 0) === 100) c.criteriaSum100++;
    if (value.territories.every((t) => t === "ES" || t === "WORLD")) c.stateWide++;
    for (const t of value.territories) {
      const cc = ccaaOf(t);
      if (cc) c.byCcaa[cc] = (c.byCcaa[cc] ?? 0) + 1;
    }
    for (const b of value.beneficiaryTypes) c.byBeneficiary[b] = (c.byBeneficiary[b] ?? 0) + 1;

    report.calls.push({ id: call.id, warnings, canonical: value });
  });
  report.errors += report.invalid.length;
  return report;
}

/** Plain-text summary for logs / SOURCES.md. */
export function formatQualityReport(r: QualityReport): string {
  const lines = [
    `Convocatorias: ${r.total} · válidas: ${r.valid} · con errores: ${r.errors} · limpias: ${r.clean}`,
    `Con fecha límite: ${r.coverage.withDeadline} (estimadas: ${r.coverage.estimatedDeadline}, sin plazo: ${r.coverage.rolling}) · con importe: ${r.coverage.withAmount}`,
    `Con criterios: ${r.coverage.withCriteria} (suman 100: ${r.coverage.criteriaSum100}) · estatales: ${r.coverage.stateWide}`,
    ...Object.entries(r.byCode)
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => `  ${code}: ${n}`),
  ];
  return lines.join("\n");
}
