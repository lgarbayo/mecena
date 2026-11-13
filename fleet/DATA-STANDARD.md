# Mecena — data standard (profile ↔ call comparability)

> Complements [DATA-PIPELINE.md](DATA-PIPELINE.md). Vocabularies live in `data/taxonomy/*.json`; the code that applies them is
> `src/features/normalize/` (pure, deterministic, zod-validated, exported from `index.ts`); tests in `tests/normalize/`.
> **Principle (unchanged):** Claude may structure free text; **code** maps it to these vocabularies and decides eligibility.

## Why

Profile and call fields are free text today. Without a standard, matching fails silently:
"pintura" ≠ "Pintura" ≠ "artes plásticas"; "A Coruña" ≠ "Coruña (A)" ≠ "ES111" ≠ "Galicia";
"autónomo" ≠ `PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA`; "Hasta 12.000 €" is not a number;
"20 días hábiles desde…" is not a date. Every field below has **one canonical form**, a mapping from every
source form, and a comparison rule.

## Conventions

| Thing | Canonical form |
|---|---|
| ids | kebab-case ASCII slugs (`artes-visuales`, `certificado-hacienda`), stable forever; labels may change |
| labels | `{ es, gl }`; UI shows `es` (Spain) by default |
| text matching | accent/case-insensitive (`fold`), plural-tolerant (`singular`), Galician forms included, 1-2 letter typo tolerance on words ≥ 5 letters (never on short words) |
| matching order | exact phrase → phrase found inside the text (longest wins, reading order) → split on "y/e/o" → typo match |
| unmapped values | never dropped silently: returned in `unmapped[]` and surfaced as a `DataWarning` |
| warnings | `{ code, severity: error\|warning\|info, field, value?, message (es) }` |

---

## (a) Disciplines — `data/taxonomy/disciplines.json`

Two-level tree (family → discipline), 51 ids. Families:
`artes-visuales` (pintura, escultura, instalacion, fotografia, ilustracion, dibujo, grabado, comic, arte-digital, performance, arte-urbano),
`musica` (composicion-musical, interpretacion-musical, musica-tradicional, musica-moderna, produccion-musical),
`artes-escenicas` (teatro, danza, circo), `audiovisual` (cine, documental, animacion, videojuegos, guion),
`literatura` (narrativa, poesia, ensayo, literatura-infantil, traduccion, edicion),
`diseno` (diseno-grafico, moda, diseno-producto, arquitectura), `artesania` (ceramica, textil, joyeria, madera, vidrio, cuero),
`gestion-cultural` (comisariado, investigacion-artistica, patrimonio).

- Each item: `label {es, gl}`, `synonyms` (es + gl, trades "pintora", techniques "acuarela", BDNS/bases wording "artes plásticas"), `cnae` (CNAE-2025 bridge, e.g. fotografía → 74.20, 90.12).
- `anyPhrases`: "todas las disciplinas", "multidisciplinar", "calquera disciplina", "creación artística y cultural"… ⇒ **no discipline restriction**.
- Vocabulary calls use: BDNS has **no discipline field**; it lives in the title/summary/bases. `extractDisciplines(title)` (phrase scan, no typo guessing) reads it; `normalizeDiscipline(label|list)` maps profile/curated values.
- Comparison `disciplineFit(profile, call)`: `any` (call empty) · `exact` · `within` (pintura ⊂ artes-visuales ⇒ full fit) · `related` (profile broader or sibling ⇒ partial) · `none`. Disciplines are a **soft** criterion (score), not a hard filter.
- Invariant (tested): no synonym belongs to two families.

## (b) Business activity — `data/taxonomy/cnae.json`

- **CNAE-2025** (RD 10/2025 = NACE Rev. 2.1), the version BDNS `sectores[]` uses: section `S` = artísticas/deportivas, `R` = sanidad, `J` = edición/audiovisual, `K` = informática… (letters moved vs CNAE-2009!).
- Canonical `CnaeRef = { section: "A".."V", code?: "90" | "90.1" | "90.12" }`. Sections carry their division ranges, so any division resolves to its section.
- `legacy2009`: users quote their old 4-digit code ("2341" cerámica, "9003" creación artística) → translated with an info warning.
- Comparison `cnaeCheck(profile, callSectors)`: prefix on the hierarchy. Call `S` accepts 90–93; call `90` accepts `90.12`; call `90.12` rejects `90.20`; profile coarser than the call ⇒ `unknown`; call with no sectors ⇒ `pass`. Only applied to business profiles.

## (c) Territory — `data/taxonomy/territories.json`

One tree, 400 nodes:

```
WORLD (BDNS "XXXX - TODO EL MUNDO")
└─ ES  España (BDNS "ES - ESPAÑA")                      level country
   └─ ES1 Noroeste                                      nuts1
      └─ ES11 Galicia      (INE CCAA 12)                ccaa  = NUTS2
         ├─ ES111 A Coruña (INE 15)                     province = NUTS3
         │  └─ mun:15030 A Coruña … (93 concellos)      municipality (INE 5 digits)
         ├─ ES112 Lugo (27)   ├─ ES113 Ourense (32)   └─ ES114 Pontevedra (36)
```

- Ids: NUTS codes exactly as BDNS `regiones[]` (`ES11 - GALICIA` → `ES11`), `WORLD`, and `mun:<INE>` for all **313 Galician municipalities** (INE, 1-1-2026). Other regions stop at province (NUTS3). Baleares/Canarias NUTS3 are islands (INE province shared).
- Inputs accepted by `normalizeTerritory`: NUTS codes with/without label, INE codes (2 digits = province, `ine:"ccaa"` for CCAA; 5 digits = municipality), names in es/gl/eu/ca with old forms (La Coruña, Orense, Gerona, Sangenjo, Villagarcía de Arosa), INE inverted articles (`Coruña (A)`, `Estrada, A`), prefixes (concello/ayuntamiento → municipality, provincia/deputación → province, comunidad autónoma → ccaa), sentences ("residentes en Galicia").
- Ambiguity: "Lugo", "A Coruña", "Ourense", "Pontevedra" are province **and** city. `prefer: "broadest"` (default; call scopes, profile `province`/`region`) or `"narrowest"` (profile `city`).
- **State-wide semantics:** call territories `[]` or `["ES"]` ⇒ any resident in Spain; `["WORLD"]` ⇒ anyone. Several territories ⇒ applicant must be within **any** of them.
- **Containment** `isWithin(profile, call)`: walk the profile's ancestors. `mun:15030 ⊂ ES111 ⊂ ES11 ⊂ ES1 ⊂ ES ⊂ WORLD`. Single-child chains are equivalent (`ES3 = ES30 = ES300` Madrid, `ES12 = ES120` Asturias). `territoryCheck` returns `unknown` when the profile has no place (⇒ "Confírmalo", not a discard).
- Profile territory = most specific of `city` → `province` → `region`; inconsistent combos (Vigo + Lugo) warn `territory-inconsistent`.
- Limits: municipal granularity only for Galicia; a call restricted to a non-Galician municipality must be expressed at province level (+ `eligibility.other` text).

## (d) Beneficiary types — `data/taxonomy/beneficiary-types.json`

| Canonical | Meaning | BDNS `tiposBeneficiarios` | ProfileKind |
|---|---|---|---|
| `persona-fisica` | persona física **sin** actividad económica (artist not registered) | 1 `PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA` | creator |
| `autonomo` | persona física **con** actividad económica (RETA/IAE) | 3 `PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA` | creator **and** business |
| `pyme` | micro/pequeña/mediana empresa (SL, SA, cooperativa ≤ 249 empl., ≤ 50 M€) | 3 (same) | business |
| `gran-empresa` | above EU SME limits | 4 `GRAN EMPRESA` | business |
| `entidad-sin-animo-lucro` | asociación, fundación, federación | 2 `PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA` | business |
| `entidad-publica` | ayuntamiento, cámara, universidad | 2 (same) | — |
| `colectivo` | agrupación sin personalidad jurídica (art. 11.3 LGS) | only when the bases say so | creator |
| — | `SIN INFORMACION ESPECIFICA` (5) | ⇒ `[]` = unknown, never discards | — |

- Profile → types: creator without `legalForm` ⇒ `persona-fisica`; `autonomo` ⇒ `autonomo`; `sl|sa|cooperativa` ⇒ `pyme` (or `gran-empresa` by employees/revenue); `asociacion` ⇒ `entidad-sin-animo-lucro`; business without legal form ⇒ unknown + warning.
- Call → types: `eligibility.legalForms` (any wording, BDNS strings or canonical ids) if present; else from `beneficiaryKinds` (coarse: creator ⇒ persona-fisica/autonomo/colectivo; business ⇒ autonomo/pyme/entidad-sin-animo-lucro).
- `beneficiaryCheck(profileTypes, callTypes)`: intersect ⇒ `pass`; either side empty ⇒ `unknown`; **autónomo vs persona-física-only** ⇒ `unknown` (some creation grants admit autónomos; the bases decide); otherwise `fail` (a pyme never sees a "sin actividad económica" call; an unregistered artist never sees SME aid).

## (e) Money

- Canonical: **integer euro cents**, `{ minCents?, maxCents?, totalCents? }` (per-applicant range + call budget).
- `parseAmount(text|number)`: numbers are euros (BDNS `presupuestoTotal`). Text needs a currency marker ("€", "euros", "EUR"); supports "mil"/"millones".
- Spanish number rules: dot = thousands, comma = decimals ("12.000,50"); "1.500" = 1500; "12.5" = 12.5; "1,5" = 1.5; **"12,000" (one comma + exactly 3 digits) = 12000** (English-style input); spaced thousands "12 000"; never glues a year to an amount ("2026 300 €" = 300 €).
- `parseAmountRange(text)` per clause: "hasta/máximo" ⇒ max; "entre X y Y", "X a Y €" ⇒ min+max; "desde/mínimo" ⇒ min; a single prize ⇒ min = max; "total/crédito/presupuesto/dotación global" ⇒ total.
- Display with `formatCents` ("12.000 €"). Warnings: `amount-unparsed` (except "Consultar bases"), `amount-inconsistent` (min > max, max > total).

## (f) Dates and deadlines

- Canonical: ISO `YYYY-MM-DD` (UTC, inclusive last day). `Deadline = { date | null, estimated, method, note? }`, `method ∈ explicit-field | explicit-text | business-days | calendar-days | months | rolling | unresolved`.
- Priority: structured field (`fechaFinSolicitud`, `Call.deadline`) ⇒ `estimated:false` · full date in text ("12/11/2026", "20 de septiembre de 2026", "15 de xaneiro") · relative plazo · rolling ("sin plazo", "todo el año", "hasta agotar crédito") ⇒ `date:null`.
- Relative plazos (Ley 39/2015 art. 30), from the **official publication date** (BDNS `anuncios[].datPublicacion`; falls back to `fechaRecepcion` with a note):
  - "N días hábiles": count from the day after; skip Saturdays, Sundays, national holidays and the call's **comunidad autónoma** holidays (when all its territories are in one CCAA).
  - "N días naturales": add N; if inhábil, next día hábil. "N meses": same day number N months later (clamped), next día hábil if inhábil.
  - Numbers as digits or words, es + gl ("veinte (20)", "cuarenta y cinco", "vinte", "dez").
  - Anchors other than publication ("desde la notificación/comunicación") ⇒ `unresolved`, never guessed.
- Computed dates are always `estimated: true` → UI says "(estimado)".
- Holidays (`data/taxonomy/holidays.json`): national 2026 (BOE) and 2027; Galicia 2026 (19/03, 02/04, 24/06, 25/07) and 2027 (Decreto 68/2026: 19/03, 25/03, 17/05). **Limits:** no local holidays; other CCAA only national days; outside 2026–2027 only weekends count (note `deadline-outside-calendar`). Add a region by adding its NUTS2 key.

## (g) Age and years active

- Canonical `AgeRule = { min?, max?, birthYearMin?, birthYearMax? }`, inclusive.
- `parseAgeRange`: "entre 18 y 35 años" ⇒ 18–35; "menores de 35" ⇒ max 34; "no haber cumplido 36" ⇒ max 35; "hasta 35 años" ⇒ max 35; "mayor de edad" ⇒ min 18; "mayores de 18 años" ⇒ min 18 (Spanish bases use it as ≥); "nacidos a partir de 1991" ⇒ birthYearMin 1991.
- With only `birthYear`, age on the reference date (the deadline) is one of two values; `ageCheck` returns `unknown` when the limit falls between them ⇒ "Confírmalo".
- Years active (`parseYearsActive`, `yearsActiveCheck` from `foundedYear`): "al menos 2 años de actividad" ⇒ min 2; "constituidas en los últimos 3 años" ⇒ max 3.

## (h) Required documents — `data/taxonomy/documents.json`

18 ids: `solicitud`, `memoria`, `dossier`, `presupuesto`, `cv`, `certificado-hacienda` (AEAT), `certificado-atriga` (Facenda galega), `certificado-seguridad-social`, `dni`, `declaracion-responsable`, `alta-autonomo` (RETA/IAE/036), `escrituras-estatutos`, `empadronamiento`, `cuenta-bancaria`, `carta-motivacion`, `plan-empresa`, `carta-aceptacion`, `facturas-proforma`.
One line can map to several ("Certificados de estar al corriente con Hacienda y la Seguridad Social" ⇒ two ids). `missingDocuments(required, available)` feeds the checklist.

## (i) Criteria

- Keep the bases' `maxPoints`; add `weightPct` = integer share of the total, **summing to exactly 100** (largest-remainder rounding: 10/10/10 ⇒ 34/33/33; 35/25 ⇒ 58/42).
- Warnings: `criteria-sum` (total ≠ 100 → rescaled), `criteria-invalid` (≤ 0 points, duplicate ids), `criteria-empty` when `criteriaSource: "bases"` has none.

---

## Canonical shapes (`src/features/normalize/types.ts`)

```ts
CanonicalProfile { id, kind, beneficiaryTypes[], territory: string|null, disciplines: id[], cnae: CnaeRef|null, birthYear?, foundedYear?, employees? }
CanonicalCall    { id, beneficiaryTypes[], beneficiarySource, territories: id[] (min 1; ["ES"] = estatal), disciplines: id[] ([] = any),
                   sectors: CnaeRef[], amount: {minCents?,maxCents?,totalCents?}, opensAt?, deadline: Deadline, age: AgeRule,
                   maxEmployees?, requiredDocuments: id[], criteria: (CallCriterion & {weightPct})[] }
```

Entry points: `normalizeProfile(profile)`, `normalizeCall(call, { publicationDate? })`, `normalizeBdnsRecord(raw)`,
`bdnsToCallPatch(raw)` (BDNS → today's `Call` fields), `evaluateEligibility(profile, call, { today })` (hard filters, Spanish reasons, `unknown` ⇒ confirm),
`validateCallDataset(calls)` + `formatQualityReport(report)`.

## AI fallback

`suggestForUnmapped("discipline" | "document", texts, resolver?)` behind the `UnmappedResolver` interface. Default = deterministic mock (word overlap with labels).
Results are filtered to valid ids and flagged `suggested: true`. **Never** used for territory or beneficiary type, never to accept/reject a call.

## Data-quality warnings

`unmapped-{discipline,territory,beneficiary,document,cnae}`, `legacy-cnae`, `missing-territory`, `territory-inconsistent`, `territory-implicit` (local/provincial/autonómico call without residence ⇒ treated as estatal, check the bases), `missing-beneficiary`, `missing-legal-form`, `missing-deadline`, `estimated-deadline`, `deadline-outside-calendar`, `deadline-before-publication`, `amount-unparsed`, `amount-inconsistent`, `criteria-{empty,sum,invalid}`, `age-inconsistent`, `invalid-record`, `duplicate-id`.

## Sources

BDNS catalogues fetched 2026-11-13 and snapshotted in `data/taxonomy/bdns/` (`/api/beneficiarios`, `/api/regiones`, `/api/actividades`, `vpd=GE`);
12 real BDNS records in `tests/normalize/fixtures/bdns-records.json`; INE *Relación de municipios a 1-1-2026*; BOE fiestas laborales 2026; DOG fiestas de Galicia 2026 and Decreto 68/2026 (2027).
