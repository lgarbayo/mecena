// National BDNS sweep for creators → shared live catalogue (<MECENA_DATA_DIR>/calls/bdns-live.json).
// Usage: npm run calls:sweep -- [--max 50] [--dry-run] [--since dd/mm/yyyy] [--max-candidates 600]
//   --dry-run  reads BDNS and applies every free filter, but never calls Claude nor writes the catalogue (no API key needed).
//   --max N    Claude structurings allowed in this run (default 50); the daily ceiling still applies.
// Without ANTHROPIC_API_KEY the structurer is a mock that would fill the catalogue with placeholders, so a real run refuses.
import { runNationalSweep } from "@/features/calls-ingest/national-sweep";
import { isMockAi } from "@/server/ai/llm";
import { getAi } from "@/server/ai";

const flag = (name: string) => process.argv.includes(`--${name}`);
const value = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const dryRun = flag("dry-run");
if (!dryRun && isMockAi()) {
  console.error("[sweep] No hay clave de Anthropic: el estructurador sería un mock y llenaría el catálogo de datos falsos.\n[sweep] Usa --dry-run para ver qué entraría sin gastar nada, o define ANTHROPIC_API_KEY.");
  process.exit(1);
}

const maxNew = Number(value("max") ?? 50);
const maxCandidates = value("max-candidates") ? Number(value("max-candidates")) : undefined;
const since = value("since");

console.log(`[sweep] ${dryRun ? "DRY RUN (sin Claude, sin escribir)" : `real: hasta ${maxNew} estructuraciones con Claude`}`);
runNationalSweep({ ai: getAi(), maxNew, dryRun, maxCandidates, ...(since ? { since } : {}), log: (m) => console.log(`[sweep] ${m}`) })
  .then((r) => {
    const sorted = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]);
    console.log("\n== Filtro de título ==");
    console.log(`búsquedas: ${r.stats.searches} · códigos distintos: ${r.stats.seen} · pasan: ${r.stats.kept}`);
    for (const [reason, n] of sorted(r.stats.dropped)) console.log(`  descartadas (${reason}): ${n}`);
    if (r.ingest) {
      const reasons: Record<string, number> = {};
      for (const s of r.ingest.skipped) reasons[s.reason.replace(/\d+/g, "N").slice(0, 70)] = (reasons[s.reason.replace(/\d+/g, "N").slice(0, 70)] ?? 0) + 1;
      console.log("\n== Detalle BDNS ==");
      for (const [reason, n] of sorted(reasons)) console.log(`  saltadas (${reason}): ${n}`);
      const titles = new Map(r.candidates.map((c) => [c.code, c]));
      const list = dryRun ? (r.ingest.wouldStructure ?? []) : r.ingest.found;
      console.log(`\n== ${dryRun ? "Entrarían (pasan todos los filtros)" : "En el catálogo tras el barrido"}: ${list.length} ==`);
      if (!dryRun) console.log(`estructuradas con Claude en esta ejecución: ${r.ingest.structured}`);
      for (const code of dryRun ? list : []) {
        const c = titles.get(code);
        console.log(`  ${code} · ${c?.organ.slice(0, 32) ?? ""} · ${c?.title.slice(0, 100) ?? ""}`);
      }
    }
    if (!r.ok) console.warn(`\n[sweep] terminó con error: ${r.error}. El catálogo no se tocó.`);
  })
  .catch((e) => console.error("[sweep] error inesperado, catálogo intacto:", e))
  .finally(() => process.exit(0));
