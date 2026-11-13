// Layer 2 + 3 — enrich selected BDNS calls and build the normalised dataset (fleet/DATA-PIPELINE.md §2).
// For each call in data/bdns/selected.json: use the cached enrichment in data/bdns/enriched/<codigo>.json,
// or download the bases PDF and extract it with Claude (mock without ANTHROPIC_API_KEY, never cached).
// Merges private calls from data/calls/private.json, validates everything and writes data/calls/calls.json.
// Usage: node scripts/enrich-calls.ts
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { documentUrl, getCallDetail, type BdnsDetail } from '../src/lib/calls/bdns.ts';
import { ClaudeBasesExtractor, MockBasesExtractor, type Enrichment } from '../src/lib/calls/enrich.ts';
import { bdnsToCall, type SelectedCall } from '../src/lib/calls/normalize.ts';
import type { Call } from '../src/lib/calls/types.ts';
import { validateCall } from '../src/lib/calls/validate.ts';

const readJson = async <T>(p: string): Promise<T> => JSON.parse(await readFile(p, 'utf8')) as T;
const useClaude = Boolean(process.env.ANTHROPIC_API_KEY);
const extractor = useClaude ? new ClaudeBasesExtractor() : new MockBasesExtractor();

async function main() {
  await mkdir('data/bdns/enriched', { recursive: true });
  await mkdir('data/bdns/raw', { recursive: true });
  const selected = await readJson<SelectedCall[]>('data/bdns/selected.json');
  const calls: Call[] = [];

  for (const sel of selected) {
    const rawFile = `data/bdns/raw/${sel.codigoBDNS}.json`;
    const detail = existsSync(rawFile) ? await readJson<BdnsDetail>(rawFile) : await getCallDetail(sel.codigoBDNS);
    if (!existsSync(rawFile)) await writeFile(rawFile, JSON.stringify(detail, null, 2));
    const cache = `data/bdns/enriched/${sel.codigoBDNS}.json`;
    let e: { verifiedAt: string; enrichment: Enrichment };
    if (existsSync(cache)) {
      e = await readJson(cache);
    } else {
      const res = await fetch(documentUrl(sel.docId));
      if (!res.ok) throw new Error(`PDF ${sel.docId}: HTTP ${res.status}`);
      const pdf = Buffer.from(await res.arrayBuffer());
      e = { verifiedAt: new Date().toISOString().slice(0, 10), enrichment: await extractor.extract({ title: detail.descripcion, pdf }) };
      if (useClaude) await writeFile(cache, JSON.stringify(e, null, 2));
      console.log(`${useClaude ? 'extracted' : 'MOCK'} ${sel.codigoBDNS}`);
    }
    calls.push(bdnsToCall(detail, e.enrichment, sel, e.verifiedAt));
  }

  if (existsSync('data/calls/private.json')) calls.push(...(await readJson<Call[]>('data/calls/private.json')));

  let invalid = 0;
  for (const c of calls) {
    const errs = validateCall(c);
    if (errs.length) {
      invalid++;
      console.error(`INVALID ${c.id}: ${errs.join('; ')}`);
    }
  }
  if (invalid) process.exit(1);

  calls.sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));
  await writeFile('data/calls/calls.json', JSON.stringify(calls, null, 2) + '\n');
  console.log(`${calls.length} calls → data/calls/calls.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
