// WP-05: BDNS ingest → <MECENA_CALLS_DIR>/bdns-cache.json (see src/features/calls-ingest/ingest.ts).
// Never breaks the app: on any network/API error the previous cache is kept and the process exits 0.
// Usage: npm run calls:ingest [-- --max 20]
import { runIngest } from "@/features/calls-ingest/ingest";
import { getAi } from "@/server/ai";

const maxArg = process.argv.indexOf("--max");
const maxCalls = maxArg > -1 ? Number(process.argv[maxArg + 1]) : undefined;

const ai = getAi();
console.log(`[bdns] ingest starting (AI: ${ai.mode})`);
runIngest({ ai, maxCalls, log: (m) => console.log(`[bdns] ${m}`) })
  .then((r) => {
    if (!r.ok) console.warn(`[bdns] failed: ${r.error}. Kept previous cache (${r.kept} calls).`);
    else console.log(`[bdns] done: ${r.written} calls, ${r.skipped.length} skipped`);
  })
  .catch((e) => console.error("[bdns] unexpected error, cache untouched:", e))
  .finally(() => process.exit(0));
