---
id: WP-05
title: ~25 real current calls for artists and pymes with sources, BDNS ingest spike and past awards
deps: []
owns:
  - data/calls/**
  - scripts/ingest-bdns.ts
  - src/features/calls-ingest/**
  - tests/calls-ingest/**
status: pending
hours: 3
criteria: [Real problem and impact, Applied AI depth]
---

**Team blocks:** B1, B2, B3 (Persona B). Feeds demo beat 5. B1 never cut; B3 cuttable; B2 may stay cache-only.

## Goal
`data/calls/calls.json` holds ~25 REAL, current (open, upcoming or recurring around Nov 2026) calls in Spain/Galicia, ~15 for creators (artes plásticas, ilustración, fotografía, residencias, premios, becas) and ~10 for pymes/autónomos (digitalización, contratación, internacionalización, industrias culturales, artesanía), each with official source URL, structured requirements, documents and **scoring criteria with weights from the bases**. Plus a time-boxed BDNS ingest spike with cache fallback and, if found, past awards for "ganadores parecidos".

## Consumes
- `Call`, `CallCriterion`, `PastAward` schemas (`src/contracts/domain.ts`); `StructureCallInput`, `AiSlice<"structureCall">`; `structured()` (tier `fast`); env `BDNS_API_BASE`, `MECENA_CALLS_DIR`.

## Provides
- `data/calls/calls.json` (array of `Call`, `source: "seed"`), optional `data/calls/bdns-cache.json` (`source: "bdns"`), optional `data/calls/awards.json` (array of `PastAward`), `data/calls/SOURCES.md` (one line per call: title, URL, date verified, how criteria were obtained).
- `callsIngestAi.real` (bases text → `Call`) and `npm run calls:ingest`.

## Acceptance criteria
- [ ] `tests/calls-ingest/dataset.test.ts` reads the real files (not the fixture dir: point `MECENA_CALLS_DIR` at `data/calls` in that test): ≥ 22 calls, all pass `Call.parse`, unique ids (kebab-case slugs), every `sourceUrl` is https and not example.org, ≥ 12 with `beneficiaryKinds` incl. "creator", ≥ 8 incl. "business", ≥ 8 with `region` Galicia or a Galician province, and for every call with `criteriaSource: "bases"` the criteria `maxPoints` sum to 100 (normalise if the bases use another total and note it).
- [ ] At least 2 "demo calls" are rich and verified: one for a Galician visual artist/illustrator and one for a Galician autónomo/pyme (digitalisation or crafts), with real criteria, documents, allowed expenses and `dossierRequirements` when the bases state them. List their ids at the top of `SOURCES.md` (WP-08/WP-09 use them).
- [ ] No invented data: amounts/deadlines exactly as in the bases; if unknown, `amountText: "Consultar bases"` / `deadline: null`; `verifiedAt` = date checked. Plain-language `summary` in Spanish from Spain.
- [ ] BDNS spike (≤ 1 h): document in `SOURCES.md` what infosubvenciones.es offers (API endpoints or downloads, filters for cultura / pymes, concesiones). `scripts/ingest-bdns.ts` fetches recent matching records, structures them with `getAi().structureCall`, writes `bdns-cache.json`; on any network/API error it keeps the previous cache and exits 0. `tests/calls-ingest/ingest.test.ts` runs the ingest function with a stubbed `fetch` (no network) and asserts valid output + error resilience.
- [ ] Past awards (cuttable, B3): if BDNS concesiones or official resolutions are reachable, `awards.json` with ≥ 6 real past awards linked to seeded calls (`callId`) with `sourceUrl`; public names only as published. Never a probability.
- [ ] `callsIngestAi.mock` stays deterministic; `real` uses the SPEC prompt (criteria only if the bases publish them).

## Notes
- **Follow `fleet/DATA-PIPELINE.md`** (team design, BDNS endpoints verified 2026-11-13: `/convocatorias/busqueda`, `/convocatorias?numConv=`, `/convocatorias/documentos`, `/concesiones/busqueda`, always `vpd=GE`; criteria/requirements/documents only live in the bases PDF → Claude extraction once per call, cached). Its `Call` sketch maps onto the binding contract like this: `codigoBDNS`→`bdnsId`, `url`→`sourceUrl`/`basesUrl`, `issuer`→`organizer`, `beneficiaryTypes`→`beneficiaryKinds` (+ `eligibility.legalForms`), `region[]`→`region` + `eligibility.residence`, `cnae[]`→`sectors`, `requirements[]`→`eligibility` fields (+ `eligibility.other` for the rest), `criteria.weight`→`maxPoints` (sum 100), `requiredDocs`→`requiredDocuments`, `eligibleExpenses`→`allowedExpenses`, `summaryPlain`→`summary`, `deadlineEstimated`→ say "(estimado)" in `deadlineText`, private calls → `source: "seed"`, `scope: "privado"`. Store raw BDNS JSON under `data/calls/raw/` for offline re-runs. If you need a field the contract lacks, file a contract change request.
- Good sources: DOG (Xunta: Consellería de Cultura, AGADIC, Igape), Deputacións (A Coruña, Lugo, Ourense, Pontevedra), concellos (A Coruña, Vigo, Santiago), Ministerio de Cultura (ayudas a la creación, Injuve Creación Joven), Fundación Barrié, Fundación María José Jove, ABANCA/Afundación, VEGAP, Acción Cultural Española (PICE), Igape/Kit Digital (Red.es) and Cámaras de Comercio for pymes.
- Use web search/fetch tools to verify each URL is live; no scraping behind logins.

## Contract change requests
