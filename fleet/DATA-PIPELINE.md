# Mecena — data pipeline: BDNS ingest and profile matching

> Design doc for the fleet. Complements [IDEA.md](IDEA.md). Product UI stays in Spanish (Spain); code in English.

**Core principle: hybrid, not "everything via Claude".** Claude structures free text (the PDF bases) and explains results in natural language. **Code decides** eligibility and the fit score: deterministic, reproducible, explainable, free.

---

## 1. BDNS API (verified 2026-11-13, public, no key)

Base URL: `https://www.infosubvenciones.es/bdnstrans/api` (always pass `vpd=GE`).

| Endpoint | Returns |
|---|---|
| `GET /convocatorias/busqueda?descripcion=…&page=0&pageSize=50&vpd=GE` | Light list: `id`, `numeroConvocatoria`, `descripcion`, `fechaRecepcion`, `nivel1-3` (issuing body). Paginated (`totalElements`, `totalPages`). E.g. "artes plásticas" → 326 results. |
| `GET /convocatorias?numConv=<codigoBDNS>&vpd=GE` | Full record (fields below). |
| `GET /convocatorias/documentos?idDocumento=<id>` | PDF of the call / regulatory bases. |
| `GET /concesiones/busqueda?numeroConvocatoria=<codigoBDNS>&vpd=GE` | Past awards (for "Ganadores parecidos a ti"). Empty for open calls; test with already-resolved ones. |

Useful structured fields in the full record:

- `tiposBeneficiarios[]` — e.g. `PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA`, `PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA`.
- `regiones[]` — NUTS codes, e.g. `ES11 - GALICIA`.
- `sectores[]` — CNAE section code + description.
- `presupuestoTotal`, `tipoConvocatoria` (e.g. `Concurrencia competitiva`), `abierto`, `instrumentos[]`.
- `fechaInicioSolicitud` / `fechaFinSolicitud` — **often `null`**; then only free text in `textInicio` / `textFin` (e.g. "20 días hábiles desde el día siguiente al de su publicación en el BOCM").
- `urlBasesReguladoras`, `sedeElectronica`, `documentos[]` (PDF ids).

What BDNS does **not** provide (only inside the PDF): scored criteria and weights, fine-grained requirements (age, residence, years active…), required documents, eligible expenses.

Legal note: the API response carries a reuse warning and BDNS may restrict abusive access → cache everything, never hammer the API during the demo.

---

## 2. Ingest pipeline (3 layers)

```
BDNS API ──► [1. Raw ingest] ──► [2. AI enrichment] ──► [3. Normalised Call] ──► SQLite
             keyword searches     PDF bases → Claude        own schema, any source
             + region/open        criteria, weights,
             filters (code)       requirements, docs,
                                  deadline (once per call,
                                  cached by codigoBDNS)
```

### Layer 1 — Raw ingest (code)
Script `ingest:bdns`:
- Keyword searches per audience:
  - creators: `artes plásticas`, `creación`, `residencia artística`, `ilustración`, `fotografía`, `beca`, `artes visuales`…
  - pymes/autónomos: `digitalización`, `autónomos`, `contratación`, `internacionalización`, `industrias culturales`…
- Fetch full record for each hit; keep region = Galicia (`ES11`) or state-wide, recent `fechaRecepcion`, open or upcoming.
- Store raw JSON keyed by `codigoBDNS` (re-runnable offline).

### Layer 2 — AI enrichment (Claude, once per call)
Download the bases PDF and extract with structured output:
- `criteria[]` — `{ name, weight, description }` → feeds the simulated jury.
- `requirements[]` — machine-checkable rules: beneficiary type, age range, residence, autónomo registration, CNAE, years active…
- `requiredDocs[]` — memoria, dossier, budget, Hacienda/SS certificates…
- `deadline` — resolved from `textFin` + publication date when the date fields are `null` (flag as `estimated`).
- `eligibleExpenses[]` — for budget lines in the draft.
- `summaryPlain` — plain-language summary of the bases (es-ES).
- `keywords[]` — topics/disciplines, for matching.

Cached by `codigoBDNS`; never re-run unless the PDF changes.

### Layer 3 — Normalised `Call`
One schema for every source: BDNS, private calls (foundations, festivals, prizes — **not in BDNS**, so they live in the curated seed) and the ~25-call curated seed. The seed is also the **demo fallback** if the API is down.

```ts
Call {
  id, source: 'bdns' | 'private' | 'seed', codigoBDNS?, url
  title, issuer, region[], beneficiaryTypes[], cnae[]
  amountTotal?, amountPerBeneficiary?
  opensAt?, deadline, deadlineEstimated: boolean
  requirements: Requirement[]   // machine-checkable
  criteria: { name, weight, description }[]
  requiredDocs[], eligibleExpenses[]
  summaryPlain, keywords[]
}
```

---

## 3. User profile

Built by the voice onboarding; uses the **same vocabulary as `Call`** so matching is mostly deterministic.

```ts
Profile {
  kind: 'creador' | 'pyme'
  beneficiaryType          // maps to BDNS tiposBeneficiarios
  region (NUTS), municipality
  disciplines[], keywords[]       // creador: technique, themes, series
  cnae?, employees?, revenue?     // pyme
  isAutonomo, age?, yearsActive
  pastAwards[], exhibitions[]
  docsAvailable[]                 // dossier, CV, Hacienda/SS certificates…
  transcript                      // their own words, for drafting
}
```

---

## 4. Matching profile ↔ call

### Who does what

| Step | Who | Why |
|---|---|---|
| Download calls from BDNS | **Code** | Plain HTTP. |
| Read structured fields (beneficiaries, region, CNAE, budget, open) | **Code** | BDNS already structures them. |
| Extract criteria, weights, requirements, docs, deadline from PDF | **Claude** (once per call, cached) | Free text; no reliable alternative. |
| Eligibility filter | **Code** | Yes/no: must be exact, explainable, free. |
| Fit score | **Code** (rules + weights) | Reproducible: same profile ⇒ same score. |
| "Por qué encajas" / "Qué te falta" copy | **Claude** | Natural language over the score code already computed. |

### Phase A — Hard eligibility filter (code, instant)
Discard the call unless **all** hold:
- `beneficiaryTypes` compatible with `profile.beneficiaryType` (an artist without autónomo registration never sees SME aid, and vice versa).
- Call region includes the user's region, or is state-wide.
- Still open / deadline not passed (and not impossibly close).
- CNAE compatible if the call restricts it (pymes).
- Every `requirements[]` rule passes. Rules whose profile field is unknown ⇒ **not discarded**, surfaced as "Confírmalo" in *Qué te falta*.

### Phase B — Deterministic fit score (code)

```
score = 25                                          // passed all hard requirements (10 if the call is for other disciplines)
      + 0–45  affinity: 0–25 discipline/sector match (taxonomy / CNAE)
                      + 0–20 the profile's own words (statement, project idea,
                        funding needs, achievements, bio) found in the call text
      + 0–12  docs already available / docs required
      + 0–8   amount relevant to the profile
      + 0–10  can you apply now (open 5–7 > upcoming 4 > recurring 2) + 0–3 local-call bonus
```

Fit points: exact/within/sector 25 · general business aid for a pyme 18 · open to any discipline 14 · related 10 ·
unknown sector 8 · other disciplines 0. "Own words" leave out discipline labels, place names and words every call uses.
The feed is sorted by this score; status (open → upcoming → recurring) and the soonest deadline only break ties.
Most of the score depends on the profile, so two different profiles see a clearly different top.
Labels: alto ≥ 70, medio ≥ 55, bajo below. Cached Claude explanations never carry the score: it is always recomputed.

Shown to the user as a **label** (alto / medio / bajo) plus the visible breakdown — never a fake precise "probability of winning".

### Phase C — Explanation (Claude, cached per profile×call)
Input: profile, call, score breakdown. Output JSON:
- `whyYouFit[]` — e.g. "Tu serie sobre la ría encaja con el criterio 'vinculación con el territorio' (30 %)".
- `whatYouMiss[]` — e.g. "Piden certificado de estar al corriente con Hacienda; no lo tienes", "Exigen < 35 años: confírmalo".
- `checklist` — required docs vs `docsAvailable`.

Claude never changes eligibility or the score; it only explains them.

### Why not let Claude score everything
- Not reproducible: two calls can give different scores for the same pair.
- Eligibility is legal, not subjective: an LLM may "feel" you fit when you can't apply.
- Cost/latency: scoring hundreds of pairs on every visit is slow on stage.
- Trust: rules behind the score can be shown to users and judges.

---

## 5. Downstream reuse

- **Draft application**: profile + transcript + call `criteria` + `eligibleExpenses` ⇒ memoria + budget in the user's own words.
- **Simulated jury** — the one place Claude *does* score, because it judges text quality, not eligibility. Anchored: fixed rubric from the extracted `criteria` and weights, low temperature, several judges, averaged; per-criterion feedback.
- **Ganadores parecidos**: `/concesiones/busqueda` on previous editions, as orientative evidence only.

---

## 6. Risks

1. **Deadlines are often text only** — must be computed from the bulletin publication date (not always `fechaRecepcion`). For the demo, hand-check deadlines in the seed.
2. **PDF quality varies** (scans, or just a link to the sede). Low risk with 25 curated calls; flag failed extractions.
3. **Few artist calls open in Galicia on any given date** — the curated seed (including private calls) guarantees a non-empty feed in the demo.
4. **API access limits** — cache raw + enriched data; demo runs from cache.
