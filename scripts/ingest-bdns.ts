// Layer 1 — raw BDNS ingest (fleet/DATA-PIPELINE.md §2).
// Runs keyword/filter searches, fetches each full record, keeps open competitive calls
// relevant to Galicia or all of Spain, and caches raw JSON under data/bdns/raw/.
// Usage: node scripts/ingest-bdns.ts [--since dd/mm/yyyy]
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  FINALIDAD,
  REGION,
  getCallDetail,
  isApplicable,
  isRelevantRegion,
  mapBeneficiaries,
  mapRegions,
  searchCalls,
  type BdnsDetail,
  type SearchParams,
} from '../src/lib/calls/bdns.ts';

const RAW_DIR = 'data/bdns/raw';
const sinceArg = process.argv.indexOf('--since');
const since = sinceArg > -1 ? process.argv[sinceArg + 1] : defaultSince();

function defaultSince(): string {
  const d = new Date(Date.now() - 90 * 864e5);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const QUERIES: { label: string; audience: 'creador' | 'pyme'; params: SearchParams }[] = [
  { label: 'cultura-galicia', audience: 'creador', params: { finalidad: FINALIDAD.cultura, regiones: REGION.galicia } },
  { label: 'cultura-espana', audience: 'creador', params: { finalidad: FINALIDAD.cultura, regiones: REGION.espana } },
  ...['artes plásticas', 'artes visuales', 'creación artística', 'residencia artística', 'ilustración', 'fotografía', 'becas creación', 'premio arte'].map(
    (q) => ({ label: `kw:${q}`, audience: 'creador' as const, params: { descripcion: q } }),
  ),
  { label: 'pymes-galicia', audience: 'pyme', params: { finalidad: FINALIDAD.comercioTurismoPymes, regiones: REGION.galicia } },
  { label: 'empleo-galicia', audience: 'pyme', params: { finalidad: FINALIDAD.empleo, regiones: REGION.galicia } },
  { label: 'idi-galicia', audience: 'pyme', params: { finalidad: FINALIDAD.idi, regiones: REGION.galicia } },
  ...['digitalización', 'autónomos', 'industrias culturales', 'emprendimiento'].map((q) => ({
    label: `kw:${q}`,
    audience: 'pyme' as const,
    params: { descripcion: q, regiones: REGION.galicia },
  })),
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

const recent = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);

// Open = flagged open, or end date in the future, or text-only deadline and published in the last 60 days.
function isOpenish(d: BdnsDetail): boolean {
  if (d.abierto) return true;
  if (d.fechaFinSolicitud) return d.fechaFinSolicitud >= today;
  return Boolean(d.textFin) && d.fechaRecepcion >= recent;
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const hits = new Map<string, Set<string>>(); // codigoBDNS -> query labels
  const audienceOf = new Map<string, Set<string>>();

  for (const q of QUERIES) {
    // Galicia-scoped queries look back to January: Xunta calls published earlier may still be open.
    const fechaDesde = q.params.regiones === REGION.galicia ? `01/01/${new Date().getFullYear()}` : since;
    const items = [];
    let total = 0;
    for (let page = 0; ; page++) {
      const res = await searchCalls({ ...q.params, fechaDesde, page, pageSize: 100 });
      items.push(...res.content);
      total = res.totalElements;
      await sleep(1500);
      if (items.length >= total || res.content.length === 0 || page >= 9) break;
    }
    for (const it of items) {
      const k = it.numeroConvocatoria;
      if (!hits.has(k)) hits.set(k, new Set());
      hits.get(k)!.add(q.label);
      if (!audienceOf.has(k)) audienceOf.set(k, new Set());
      audienceOf.get(k)!.add(q.audience);
    }
    console.log(`${q.label}: ${items.length}/${total}`);
  }

  const candidates = [];
  let i = 0;
  for (const [codigo, labels] of hits) {
    i++;
    const file = `${RAW_DIR}/${codigo}.json`;
    let d: BdnsDetail;
    if (existsSync(file)) {
      d = JSON.parse(await readFile(file, 'utf8'));
    } else {
      try {
        d = await getCallDetail(codigo);
        await writeFile(file, JSON.stringify(d, null, 2));
      } catch (err) {
        console.warn(`skip ${codigo}: ${(err as Error).message}`);
        continue;
      }
      await sleep(800);
    }
    const regions = mapRegions(d);
    if (!isApplicable(d) || !isRelevantRegion(regions) || !isOpenish(d)) continue;
    candidates.push({
      codigoBDNS: codigo,
      title: d.descripcion,
      issuer: [d.organo.nivel2, d.organo.nivel3].filter(Boolean).join(' / '),
      audiences: [...audienceOf.get(codigo)!],
      beneficiaryTypes: mapBeneficiaries(d),
      regions,
      presupuestoTotal: d.presupuestoTotal,
      tipoConvocatoria: d.tipoConvocatoria,
      abierto: d.abierto,
      fechaFinSolicitud: d.fechaFinSolicitud,
      textFin: d.textFin,
      docs: d.documentos.length,
      queries: [...labels],
    });
    if (i % 25 === 0) console.log(`details ${i}/${hits.size}`);
  }

  await writeFile('data/bdns/candidates.json', JSON.stringify({ fetchedAt: today, since, candidates }, null, 2));
  console.log(`hits ${hits.size} → candidates ${candidates.length} (data/bdns/candidates.json)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
