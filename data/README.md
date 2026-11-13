# Calls dataset (B1 + B2)

The app reads **`data/calls/calls.json`**: an array of `Call` objects (contract in `src/lib/calls/types.ts`, design in `fleet/DATA-PIPELINE.md`). It needs no network access at demo time.

## Pipeline

```
npm run ingest:bdns    # Layer 1: BDNS API → data/bdns/raw/*.json (cache, gitignored) + data/bdns/candidates.json
                       #          (edit data/bdns/selected.json to choose which candidates go into the app)
npm run enrich:calls   # Layer 2+3: bases PDF → enrichment (cached in data/bdns/enriched/) → Call,
                       #            + data/calls/private.json → validate → data/calls/calls.json
npm test               # contract + dataset checks
```

- **BDNS API** (`https://www.infosubvenciones.es/bdnstrans/api`): public, no key, rate-limits bursts (429). The client retries with backoff. Raw records and PDFs are a local cache. Only the selected raw records are committed.
- **Enrichment**: with `ANTHROPIC_API_KEY` set, a selected call with no cache file is extracted from its PDF by Claude (`claude-opus-5-5`, structured output) and cached. Without a key, a deterministic mock is used and nothing is cached. The committed caches were extracted by reading each PDF (`extractedBy` field), using the same schema.
- **Private calls** (foundations, festivals, prizes) are not in BDNS. They are kept by hand in `data/calls/private.json`, each checked against its official page (`verifiedAt`).

## Field notes for consumers (matching, feed, jury)
- `procedure: 'no_competitiva'` → first-come aid with no scored criteria (`criteria: []`). There, the simulated jury should check completeness against `requiredDocs` and `requirements`, not quality.
- `criteriaWeightsStated: false` → the bases list criteria without points, so the weights were split evenly. The UI should say so.
- `deadlineEstimated: true` → computed from text such as "25 días naturales desde la publicación en el BOP". Show it as "aprox.".
- `requirements[].kind: 'other'` → not machine-checkable. Matching shows it as "Confírmalo".
- `fee` → the entry fee of a private call. Show it on the card.
