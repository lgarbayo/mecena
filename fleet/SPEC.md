# Mecena: spec

> Para artistas, ilustradores, fotógrafos **y** pymes/autónomos: un agente de IA que monta tu perfil y tu dossier hablando, encuentra las convocatorias que encajan contigo, te prepara la solicitud con tus propias palabras y la pasa por un tribunal simulado antes de que la presentes. **"Tú creas. Mecena se encarga del papeleo."**

Binding brief: `fleet/IDEA.md`. Hackathon: `fleet/hackathon.json` (1hack 2026, FIC A Coruña, live demo ≤ 3 min, no published rubric). UI copy in Spanish from Spain (tú, never voseo); code, commits and comments in English.

Clock: build ends **Sat 2026-11-14 19:00 CET**. Feature freeze **16:00 CET** (16:00-18:00 = `hk-qa` along the demo script + fixes); `main` frozen **18:00** (only demo fixes after); 17:00-18:30 rehearsal x2. Team split: `fleet/team/PERSONA-A.md` (integrates and merges `main`) and `fleet/team/PERSONA-B.md`.

## Target prizes
| Prize | Why we can win it | Evidence judges will see |
|---|---|---|
| Overall (assumed: live wow 30 %, real problem 30 %, AI depth 20 %) | Voice → profile + dossier building live on a phone, real calls, jury score rising live | Beats 2-5 on stage, on a real phone, with a real artist from the room |
| RevenueCat (team target, sponsor) | Real Web Billing **sandbox** purchase, `pro` entitlement gating the core value, subscription + one-off, Hormozi offer with guarantee | Beat 4: paywall → RevenueCat sandbox checkout → entitlement unlocks the draft; RevenueCat dashboard shows the sandbox customer |
| Applied AI depth | Claude does real work: incremental structured extraction, vision technical sheets, eligibility reasoning, drafting grounded in transcript segment ids, multi-judge scoring on official criteria, MCP tools | Live profile/dossier diffing; "escrito con tus palabras" segment highlights; per-criterion jury feedback; Claude Desktop calling Mecena tools |

## Demo script (≤ 3:00, live, phone mirrored to the projector)
Every feature below appears here, or it is cut.
1. **0:00 Hook (20 s).** Opening screen `/`: three sourced data points, big type: "La mitad de los artistas en España gana menos del salario mínimo" (Nebrija/UGR), "El 34 % de los trabajadores culturales son autónomos, frente al 16 % del total" (Cotec 2025) and "Más del 50 % de las pymes no pide ayudas porque no sabe que existen; 1 de cada 4 abandona por complejidad" (MuyPymes 2025). Trust line: "El arte es tuyo; nosotros hacemos el papeleo." CTA "Empezar hablando".
2. **0:20 Voice onboarding (60 s, hero).** A real artist from the room taps the mic (`/onboarding`) and talks ~60 s. The transcript streams; profile chips (nombre, ciudad, disciplinas, logros…) pop in and dossier sections (Declaración, Biografía, Series, CV) grow **live** beside it. Trust strip visible: "No entrenamos con tu obra. Tú tienes la última palabra."
3. **1:20 Photos (20 s).** `/obras`: photograph 2 works; say one sentence per piece → technical sheet (título, año, técnica, medidas, serie, concepto) fills; light crop only ("nunca modificamos tu obra").
4. **1:40 Dossier + PDF (10 s).** `/dossier`: editorial dossier page → "Descargar PDF" opens a clean PDF.
5. **1:50 Matched calls (25 s).** `/convocatorias`: real calls with amount, deadline, **por qué encajas / qué te falta**; open one → plain-language bases + document checklist (+ "ganadores parecidos" if available). **One tap: Pyme mode** → feed switches to SME aid (digitalización, contratación…) → tap back.
6. **2:15 Paywall (20 s).** "Prepárame la solicitud" → paywall (Pro mensual 9 €, anual 79 €, Solicitud premium 15 €; anchor "una consultora cobra 10-15 % de la ayuda"; guarantee 90 días) → RevenueCat sandbox checkout → unlocked → draft memoria + statement + budget + checklist "escrito con tus palabras".
7. **2:35 Simulated jury (20 s).** `/tribunal/:id`: 3 judges score with the call's official criteria: **61/100**, per-criterion fixes → "Aplicar mejoras" → **84/100** with animated rise. Disclaimer: orientative.
8. **(Optional, if time) Claude Desktop** calls Mecena's MCP: "hazme el dossier para la convocatoria X" → `build_dossier` + `export_dossier_pdf` → link opens on the phone.
9. **2:55 Close.** Survey numbers from tonight + LOIs (slide, not app).

Fallbacks: `/demo` panel resets state, rotates the RevenueCat app user id (fresh sandbox customer = paywall shows again) and can load an "onboarded" scenario if the mic fails; text input replaces voice; AI mock mode keeps every beat working offline.

## Wow moments
- The dossier writing itself while the artist talks (beat 2).
- A phone photo becoming a gallery-grade technical sheet (beat 3).
- One tap from artist to pyme: same engine, second market (beat 5).
- A real RevenueCat purchase unlocking the outcome, not a feature (beat 6).
- 61 → 84 with the official criteria of a real call (beat 7).
- Claude Desktop driving Mecena through MCP (beat 8).

## Users and problem
- **Who:** visual artists and illustrators in Galicia (beachhead); pymes and autónomos (expansion path, same pipeline, `Profile.kind`).
- **Pain today:** ~50 % of Spanish artists earn below minimum wage, 46.9 % < 8,000 €/year (Nebrija/UGR, 1,100+ artists). 34 % of cultural workers are self-employed vs 16 % overall (Cotec 2025). > 50 % of SMEs never apply for public aid because they don't know about it and 1 in 4 abandons for complexity (MuyPymes 2025); 200,000+ autónomos never claimed Kit Digital (autonomosyemprendedor.es 2025). Finding calls, reading bases, building the dossier and writing the memoria takes days; consultancies charge 10-15 % of the grant. **Honest gap:** we do NOT claim arts grants go unclaimed.
- **Why now:** LLMs can extract structure from speech and bases reliably, vision can write technical sheets, and MCP lets the same tools be driven from any assistant.
- **Legal line:** Mecena prepares; the user submits with their own certificado digital/Cl@ve. Never submit on their behalf.

## Scope
### Must (demo path)
Opening data screen + trust copy · voice onboarding with live profile + dossier · photo + vision technical sheet · dossier page + PDF (creator and business) · ~25 real calls with source URLs · matching feed with why-you-fit / what's-missing + mode switch · RevenueCat paywall (sandbox) + mock adapter + entitlements · drafting from the user's words · simulated jury 61 → 84 · MCP server with 8 tools + Claude Desktop config · demo seed/reset + README with phone tunnel.
### Should (if time)
BDNS live ingest with cache fallback · "ganadores parecidos" from past awards · call-specific dossier variants (notes + image limits) · in-app agent endpoint (`/api/agent`) · real-AI prompt tuning.
### Cut list (drop in this order if late)
1. WP-10 stretch (justification by invoice photo, B2B panel for schools) → pitch slide only.
2. In-app agent UI (keep `/api/agent` + MCP).
3. BDNS live ingest (keep curated seed).
4. Past awards ("ganadores parecidos").
5. Call-specific dossier variants (keep plain dossier).
6. Real vision crop (keep identity crop; sheet from voice only).
7. Beat 8 (Claude Desktop) on stage → mention only.
Never cut: beats 1, 2, 5, 6, 7.

## Architecture
```mermaid
flowchart LR
  Phone["Phone browser (Next.js App Router, mobile-first)\nWeb Speech es-ES · camera input · RevenueCat Web SDK"]
  subgraph Next["Next.js server (one process)"]
    Routes["/api/* route handlers\nsrc/app/api/**"]
    Features["Feature services\nsrc/features/<feature>/service.ts"]
    Tools["Shared tools module\nsrc/tools/registry.ts (8 tools)"]
    AI["AiService\nsrc/server/ai (real Claude | deterministic mocks)"]
    Store["JSON store\ndata/runtime/db.json (+uploads, exports)"]
  end
  Calls["data/calls/*.json\n(curated real calls, BDNS cache, awards)"]
  MCP["MCP server (stdio)\nsrc/mcp/server.ts"]
  Desktop["Claude Desktop / Claude Code"]
  Claude["Anthropic API\nsonnet-5-5 fast · opus-5-5 smart"]
  RC["RevenueCat Web Billing (sandbox)"]
  BDNS["BDNS API (infosubvenciones.es)"]
  Phone -->|fetch JSON| Routes --> Features
  Features --> AI --> Claude
  Features --> Store
  Features --> Calls
  Tools --> Features
  Routes -->|/api/agent| Tools
  Desktop -->|stdio| MCP --> Tools
  Phone -->|purchase| RC
  Routes -->|verify entitlements (REST, optional)| RC
  Ingest["scripts/ingest-bdns.ts"] --> BDNS
  Ingest --> Calls
```
- **Stack:** TypeScript, Node ≥ 22.12, Next.js 16 App Router (Turbopack), React 19, zod 4, Vitest 5, npm. Persistence: one JSON file, read-through on every call (so the MCP process and the web app see each other's writes), serialised atomic writes.
- **Deploy:** Fly.io at https://mecena.fly.dev (one machine + persistent volume at `/data`, Basic auth via `src/proxy.ts`; see README). HTTPS gives the phone the mic (Web Speech needs it) and RevenueCat checkout. Local alternative: `npm run dev:phone` + an HTTPS tunnel.
- **Platform APIs used:** Web Speech API (`webkitSpeechRecognition`, es-ES) for dictation; `<input type="file" accept="image/*" capture="environment">` for photos; RevenueCat Web SDK for checkout; BDNS public API for live calls (spike).
- **Data pipeline:** see `fleet/DATA-PIPELINE.md` (team design doc, binding for WP-05/WP-06): hybrid, code decides eligibility and fit score, Claude structures the bases and explains. Its `Call`/`Profile` sketches are mapped onto the contracts in `src/contracts/domain.ts` (the contract wins; mapping in WP-05).
- **AI components (real work each does):**
  - *Onboarding turn* (fast): incremental structured extraction from each spoken chunk → `ProfilePatch` + changed `DossierSection`s with `sourceSegmentIds`, plus one follow-up question.
  - *Describe work* (fast, vision): technical sheet from photo + the user's voice note; crop/rotation suggestion (never alters the artwork).
  - *Explain fit* (fast): plain-Spanish why-you-fit / what's-missing on top of deterministic eligibility rules.
  - *Structure call* (fast): bases/BDNS text → `Call` (criteria, documents, expenses).
  - *Draft application* (smart): memoria/statement/company text, budget mapped to allowed expenses, checklist; every section cites transcript segment ids.
  - *Judge application* (smart, × 3 personas) and *revise application* (smart): per-criterion scores with official weights, concrete fixes, revision using only the user's facts.
  - *In-app agent* (smart, tool use over the 8 shared tools).
- **Sponsor tools:** RevenueCat Web Billing (sandbox): products `mecena_pro_monthly`, `mecena_pro_annual` (entitlement `pro`), `mecena_solicitud_premium` (one-off → premium credit). Targets the RevenueCat prize.

### AI prompt outlines
All via `structured()` in `src/server/ai/llm.ts` (`beta.messages.parse` + `betaZodOutputFormat`, server-side refusal fallback `fallbacks: "default"`, effort low for fast / high for smart). Every system prompt includes: Spanish from Spain; **never invent facts the user did not say**; keep the user's phrasing; the user has the last word.
- **Onboarding** (system): "Eres Mecena, asistente que construye el perfil y el dossier de un/a {creador/a | pyme} mientras habla. Recibes el perfil actual, las secciones actuales y el nuevo fragmento. Devuelve solo lo que el fragmento aporta: patch de perfil, secciones que cambian (reescritas en primera persona, con sus palabras, sin adornos), sourceSegmentIds, y una pregunta breve para seguir (lo que falta para optar a convocatorias: proyecto, logros, ciudad…)." Keys: creator `statement|bio|series|works|cv|contact`, business `activity|team|projects|figures|location|contact`.
- **Describe work** (system + image + voice note): "Ficha técnica de una obra. Toma título/serie/concepto de lo que dice el autor; deduce técnica y soporte de la imagen solo si es evidente; medidas solo si las dice. Sugiere recorte del marco de la obra dentro de la foto (0..1) y rotación; si dudas, recorte identidad. Nunca describas cambios a la obra."
- **Explain fit**: profile + call + rule reasons → ≤ 4 short bullets each, + 2-3 sentence plain summary of the bases ("quién puede pedirla, cuánto, hasta cuándo, qué piden").
- **Structure call**: raw bases text → `Call`; criteria only if the bases publish them (`criteriaSource: "bases"`), else estimated + flagged.
- **Draft**: profile, call (criteria, allowed expenses, documents), full transcript with ids, works → sections tailored to each criterion, budget lines only from `allowedExpenses`, checklist from `requiredDocuments` (+ Hacienda/SS certificates). Must quote/paraphrase transcript; each section lists `sourceSegmentIds`; mark gaps as "[Completa: …]" instead of inventing.
- **Judge** (per persona: técnica de la administración / comisaria / gestor cultural; for business calls: técnico de la agencia / consultora / evaluador de impacto): score each official criterion 0..maxPoints with a one-line comment and 1-2 concrete fixes that the user's own facts can satisfy.
- **Revise**: apply accepted fixes using only facts present in transcript/profile; keep voice; bump version.

## Contracts
`src/contracts/` (import from `@/contracts`; API bodies from `@/contracts/api`). Only the integrator edits these; builders file "Contract change requests" in their WP.
- `domain.ts`: Profile (kind creator|business), TranscriptSegment, Work + TechnicalSheet + CropSuggestion, DossierSection/Dossier/DossierVariant, Call (+ CallCriterion), PastAward, MatchResult, Application (+ sections, budget, checklist), JudgePersona, CriterionScore, JuryScore, EntitlementState, Db.
- `api.ts`: request/response schemas per route. `routes.ts`: UI routes (Spanish slugs) and API paths. `tools.ts`: the 8 MCP/agent tools (zod input/output, descriptions, `PaymentRequiredError`, `NotFoundError`). `ai.ts`: `AiService` + per-feature `AiSlice`. `purchases.ts`: products, packages, `PurchasesAdapter`, `canDraft`, `FREE_MATCHES_PER_MONTH = 3`. `env.ts`: env names and readers.
- Scaffold-owned shared code (builders import, do not edit): `src/server/store`, `src/server/ai/{index,llm}.ts`, `src/server/http.ts`, `src/fixtures`, `src/lib/api-client.ts`, `src/components/{ui,shell,voice}/**`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/not-found.tsx`, `src/app/api/profile/**`, `tests/setup.ts`, `tests/helpers.ts`, `tests/scaffold/**`, root configs, `package.json`.
- Cross-WP component seams (stub exists, owner replaces internals, keeps the export): `ModeSwitch` (`src/features/matching/ui/ModeSwitch.tsx`, WP-06, mounted in the header), `Paywall` (`src/features/purchases/ui/Paywall.tsx`, WP-07, used by WP-06 and WP-08), `getPurchases()` (`src/features/purchases/client.ts`, WP-07).

### Data model (JSON store)
`Db = { meta {activeProfileId, appUserId}, profiles[], transcripts[], works[], dossiers[], applications[], juryScores[], entitlements[], usage[], matchCache[] }` in `<MECENA_DATA_DIR>/db.json`. Uploads in `<data>/uploads/<workId>.<ext>`, PDFs in `<data>/exports/`. Calls are read-only files: `<MECENA_CALLS_DIR>/calls.json` (curated), `bdns-cache.json` (ingest), `awards.json` (past awards). Without any calls file the app falls back to the `[FIXTURE]` calls (fictional, clearly labelled). Initial DB: `MECENA_SEED_FILE` (`data/demo/seed.json`) if valid, else `defaultDb()` (blank creator + fixture business).

## Data and sandbox
- **RevenueCat sandbox:** create a project + Web Billing app (Stripe test mode), products `mecena_pro_monthly` (9 €/mes), `mecena_pro_annual` (79 €/año), `mecena_solicitud_premium` (15 €, one-off), entitlement `pro` attached to both subscriptions, offering `default` with packages `$rc_monthly`, `$rc_annual`, `solicitud_premium`. Use the **sandbox** public key (`rcb_sb_…`). Test card 4242 4242 4242 4242. Each demo reset rotates `appUserId` → new sandbox customer. Steps in `docs/revenuecat.md` (WP-07).
- **Demo data:** `npm run demo:reset` (blank creator, fixture business, rotated app user id) or `-- --onboarded`; `/demo` panel does the same from the phone.
- **Env vars (`.env.example`):** `ANTHROPIC_API_KEY`, `MECENA_AI_MOCK`, `MECENA_MODEL_FAST`, `MECENA_MODEL_SMART`, `NEXT_PUBLIC_REVENUECAT_API_KEY`, `REVENUECAT_SECRET_API_KEY`, `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID`, `NEXT_PUBLIC_REVENUECAT_OFFERING_ID`, `NEXT_PUBLIC_PURCHASES_MOCK`, `MECENA_DATA_DIR`, `MECENA_PUBLIC_URL`, `MECENA_CALLS_DIR`, `MECENA_SEED_FILE`, `BDNS_API_BASE`. No keys → everything runs on mocks.
- **Commands:** `npm install` · `npm run dev` (or `dev:phone` + tunnel) · `npm test` · `npm run typecheck` · `npm run build` · `npm run mcp` · `npm run demo:reset` · `npm run calls:ingest`.

## Work packages
| ID | Title | Deps | Owns | Hours | Team blocks |
|---|---|---|---|---|---|
| WP-01 | Voice onboarding: live profile + dossier, opening data screen, trust | — | `src/app/page.tsx`, `src/app/onboarding/**`, `src/app/confianza/**`, `src/app/api/onboarding/**`, `src/features/onboarding/**`, `tests/onboarding/**` | 3 | A1, A2, A3 |
| WP-02 | Works: photo capture + vision technical sheets | — | `src/app/obras/**`, `src/app/api/works/**`, `src/features/works/**`, `tests/works/**` | 2.5 | A4 |
| WP-03 | Dossier page + PDF (creator and business) + call variants | — | `src/app/dossier/**`, `src/app/api/dossier/**`, `src/features/dossier/**`, `tests/dossier/**` | 3 | A5, A6 |
| WP-04 | Shared tools, MCP server, in-app agent, Claude Desktop config | — | `src/tools/**`, `src/mcp/**`, `src/features/agent/**`, `src/app/api/agent/**`, `docs/mcp.md`, `docs/claude_desktop_config.example.json`, `tests/mcp/**`, `tests/agent/**` | 2 | A7, A8 (+ exposes B11) |
| WP-05 | ~25 real calls + BDNS ingest spike + past awards | — | `data/calls/**`, `scripts/ingest-bdns.ts`, `src/features/calls-ingest/**`, `tests/calls-ingest/**` | 3 | B1, B2, B3 (data) |
| WP-06 | Matching engine + calls feed + mode switch | — | `src/app/convocatorias/**`, `src/app/api/calls/**`, `src/features/matching/**`, `tests/matching/**` | 3 | B4, B5, B11 (`search_calls`, `explain_call`), B3 (display) |
| WP-07 | RevenueCat paywall, entitlements, Hormozi offer | — | `src/app/pro/**`, `src/app/api/entitlements/**`, `src/features/purchases/**`, `docs/revenuecat.md`, `tests/purchases/**` | 3 | B6, B7 |
| WP-08 | Drafting from the user's words + simulated jury 61 → 84 | — | `src/app/solicitud/**`, `src/app/tribunal/**`, `src/app/api/applications/**`, `src/app/api/jury/**`, `src/features/drafting/**`, `src/features/jury/**`, `tests/drafting/**`, `tests/jury/**` | 3 | B8, B9, B11 (`draft_application`, `score_application`) |
| WP-09 | Demo seed, reset panel, demo script doc, README + phone tunnel | — | `data/demo/**`, `public/demo/**`, `scripts/demo-reset.ts`, `src/app/demo/**`, `src/app/api/demo/**`, `src/features/demo/**`, `README.md`, `docs/demo-script.md`, `tests/demo/**` | 2 | A9, A10 (supports A11, A13) |
| WP-10 | STRETCH: justification (invoice OCR) + B2B schools panel | WP-08 | `src/app/justificacion/**`, `src/app/escuelas/**`, `src/app/api/justification/**`, `src/features/justification/**`, `tests/justification/**` | 3 | B10 (+ A12 B2B slide support) |
| WP-11 | Pitch and traction kit (docs only, human-led, `hk-pitch`) | — | `docs/pitch/**` | 2 | A11, A12, A13, B12, B13, B14, B15, B16 |

Block coverage check: A1-A13 and B1-B16 all map to at least one WP above (non-code blocks A11-A13 and B12-B16 via WP-11 kits; the humans still do the outreach, rehearsals and pitch).

Testing note for builders: `tests/setup.ts` isolates every test (temp data dir, fixture calls, AI and purchases mocks). Component tests need `// @vitest-environment jsdom` at the top of the file. `tests/scaffold/**` is scaffold-owned: if your change legitimately breaks it, say so under "Contract change requests" instead of editing it.

Launch order with 7 builders: wave 1 = WP-01, WP-02, WP-03, WP-05, WP-06, WP-07, WP-08; wave 2 (first free slots) = WP-04, WP-09; WP-11 runs alongside with `hk-pitch` (no builder slot, no code); wave 3 only if ahead of schedule = WP-10. Persona A owns WP-01/02/03/04/09, Persona B owns WP-05/06/07/08/10; WP-11 is split by block.

**Critical path:** wave 1 (≤ 3 h, WP-01/03/05/06/07/08 in parallel) → merge → wave 2 WP-09 (2 h, polishes against merged data) → integration + live-key tuning → 16:00 freeze → QA/rehearsal. Every core WP has no deps (the scaffold already provides working baselines for every seam), so the real critical path is **WP-08 (draft + jury) + WP-07 (RevenueCat sandbox setup)** finishing, then live-key prompt tuning of WP-01 onboarding.

## Risks
| Risk | Mitigation |
|---|---|
| Web Speech API unavailable or flaky (Firefox, in-app browsers, venue Wi-Fi; Chrome needs HTTPS for mic) | Test on the demo phone in Chrome over the cloudflared HTTPS tunnel; text fallback always visible; `/demo` "onboarded" scenario |
| Claude latency makes the live build feel slow | Fast tier with effort `low` per chunk; send chunks on each final result (not the whole transcript); optimistic UI (transcript appears instantly, sections animate in); mock mode as last resort |
| RevenueCat Web Billing setup (Stripe test account, products, offering) takes longer than expected | WP-07 starts the dashboard setup first; mock adapter behind the same `PurchasesAdapter` keeps the demo working; sandbox key only |
| RevenueCat one-off "Solicitud premium" crediting is subtle (non-subscription transactions) | Server counts unique non-subscription transactions of `mecena_solicitud_premium` minus used credits; without secret key, trust client sync (sandbox demo only) |
| `@revenuecat/purchases-js` 1.74 API: verified `Purchases.configure({apiKey, appUserId})`, `getOfferings`, `purchase({rcPackage, htmlTarget, customerEmail})`, `presentPaywall`, `getCustomerInfo`, `changeUser` in the installed d.ts | Uncertain: whether `presentPaywall` needs a dashboard-configured paywall; use our own paywall UI + `purchase()` |
| BDNS API: endpoints verified by the team (`fleet/DATA-PIPELINE.md`), but criteria/requirements only exist in the bases PDFs, deadlines are often free text, and abusive access may be throttled | Ingest time-boxed inside WP-05, cached by codigoBDNS; curated seed is the demo source of truth; never call BDNS live on stage |
| Real calls go stale or have no published criteria | `verifiedAt` per call; prefer calls with criteria in the bases for the demo; `criteriaSource: "estimated"` flagged in UI |
| Judges ask "is 84 real?" | Disclaimer on every score; scores use the call's official criteria; mock is deterministic only for offline mode |
| AI invents facts in drafts (trust!) | Prompts forbid it; sections carry `sourceSegmentIds`; gaps rendered as "[Completa: …]"; user edits every text |
| Vision crop damages trust ("you altered my art") | Crop/rotation only, CSS-applied, original kept, user confirms |
| PDF rendering (`@react-pdf/renderer`) font/accents issues on server | Use built-in fonts or a bundled TTF with Spanish glyphs; test accents (ñ, á) in a unit test; fallback minimal PDF already in scaffold |
| Models `claude-sonnet-5-5` / `claude-opus-5-5`: forced `tool_choice` is a 400, effort defaults differ | `structured()` uses output_config.format (no forced tools); agent uses `tool_choice: auto`; effort set explicitly |
| JSON store contention between Next and MCP processes | Read-through + atomic rename; single-user demo; last write wins is acceptable |
| 7 builders editing shared files | Disjoint `owns`; shared files scaffold-owned; contract change requests go through the integrator |
