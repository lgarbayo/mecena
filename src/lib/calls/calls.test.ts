import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isApplicable, isRelevantRegion, mapBeneficiaries, mapRegions, type BdnsDetail } from './bdns.ts';
import { MockBasesExtractor } from './enrich.ts';
import { bdnsToCall } from './normalize.ts';
import type { Call } from './types.ts';
import { validateCall } from './validate.ts';

const calls: Call[] = JSON.parse(readFileSync('data/calls/calls.json', 'utf8'));

test('dataset: every call satisfies the contract', () => {
  for (const c of calls) assert.deepEqual(validateCall(c), [], c.id);
});

test('dataset: ids are unique and every call links to its source', () => {
  assert.equal(new Set(calls.map((c) => c.id)).size, calls.length);
  for (const c of calls) assert.match(c.url, /^https?:\/\//, c.id);
});

test('dataset: covers both app modes', () => {
  assert.ok(calls.some((c) => c.audiences.includes('creador')));
  assert.ok(calls.some((c) => c.audiences.includes('pyme')));
});

test('dataset: no call had closed when it was verified', () => {
  for (const c of calls) if (c.deadline) assert.ok(c.deadline >= c.verifiedAt, `${c.id} closed ${c.deadline}`);
});

const raw = JSON.parse(readFileSync('data/bdns/raw/934864.json', 'utf8')) as BdnsDetail;

test('bdns mapping: beneficiaries and NUTS regions', () => {
  assert.deepEqual(mapBeneficiaries(raw), ['persona_fisica']);
  assert.deepEqual(mapRegions({ regiones: [{ descripcion: 'ES11 - GALICIA' }, { descripcion: 'ES - ESPAÑA ' }] }), ['ES11', 'ES']);
  assert.ok(isRelevantRegion(['ES111']));
  assert.ok(!isRelevantRegion(['ES30']));
});

test('bdns filter: excludes direct awards, keeps competitive and first-come calls', () => {
  assert.ok(isApplicable({ tipoConvocatoria: 'Concurrencia competitiva - canónica', descripcion: 'Premios' }));
  assert.ok(isApplicable({ tipoConvocatoria: 'Concurrencia no competitiva', descripcion: 'Ayudas' }));
  assert.ok(!isApplicable({ tipoConvocatoria: 'Concesión directa - instrumental', descripcion: 'X' }));
  assert.ok(!isApplicable({ tipoConvocatoria: 'Concurrencia competitiva', descripcion: 'CONVENIO con la asociación X' }));
});

test('normalize: mock enrichment produces a valid call with the official deadline', async () => {
  const e = await new MockBasesExtractor().extract({ title: raw.descripcion, pdf: Buffer.alloc(0) });
  const call = bdnsToCall(raw, e, { codigoBDNS: raw.codigoBDNS, audiences: ['creador'], docId: 1 }, '2026-11-13');
  assert.equal(call.deadline, '2027-01-08');
  assert.equal(call.deadlineEstimated, false);
  assert.equal(call.maxScore, 100);
  assert.deepEqual(validateCall(call), []);
});

test('validate: rejects a competitive call without criteria', () => {
  const bad = { ...calls[0], procedure: 'competitiva', criteria: [] } as Call;
  assert.ok(validateCall(bad).includes('criteria required for competitiva'));
});
