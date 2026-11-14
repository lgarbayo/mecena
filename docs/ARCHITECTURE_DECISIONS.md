# Architecture decisions

This file is the honest record of how Mecena was built at **1hack-2026** (FIC, A Coruña) between the evening of
2026-11-13 and the end of the build on 2026-11-14 at 19:00 CET, by a two-person team working with AI coding agents.
It explains what we chose, why, what went wrong and how we fixed it, so that anyone who picks up the code understands
the reasoning behind it and not only the result.

Each decision is a lightweight ADR (Architecture Decision Record) with four parts:

- **Status**: `Accepted` (it is how the code works today), `Superseded by` a later ADR (we tried it and moved on; the
  record stays so the history makes sense) or `Proposed` (under discussion in a pull request).
- **Context**: the problem and the forces at play when we decided.
- **Decision**: what we did.
- **Consequences**: what it made easier, what it cost, and what we learned later.

Every ADR ends with **Evidence**: the pull requests (on https://github.com/lgarbayo/mecena) and the files that back it,
so you can check each claim yourself. ADRs are never rewritten after the fact: when a decision changes, we add a new ADR
and mark the old one as superseded.

The maintainers keep adding ADRs as the project grows. If your pull request makes a decision that a future contributor
would ask "why?" about (a new dependency, a storage change, a new external service, a security trade-off), add an ADR
in the same pull request, with the next free number, using this template:

```markdown
## ADR-<number>: <short title in the imperative or as a statement>

- **Status:** Proposed | Accepted | Superseded by ADR-<number>
- **Date:** <YYYY-MM-DD>

**Context.** <What problem were we solving? What constraints, deadlines, costs or risks mattered?>

**Decision.** <What we chose, in one or two paragraphs. Name the files and settings involved.>

**Consequences.** <What gets easier, what gets harder, what we will have to watch, what we gave up.>

**Evidence.** <PR numbers, file paths, measurements.>
```

For example, a future move from the JSON file to SQLite would be "ADR-026: Move the store from db.json to SQLite",
with Context describing the limits of ADR-003, and ADR-003's status changed to "Superseded by ADR-026".

## Index

| ADR | Decision | Status |
|---|---|---|
| [001](#adr-001-build-from-a-binding-spec-shared-contracts-and-parallel-work-packages) | Build from a binding spec, shared contracts and parallel work packages | Accepted |
| [002](#adr-002-nextjs-16-app-router-react-19-and-typescript-as-the-only-stack) | Next.js 16 App Router, React 19 and TypeScript as the only stack | Accepted |
| [003](#adr-003-one-json-file-as-the-database) | One JSON file as the database | Accepted |
| [004](#adr-004-every-ai-call-behind-an-interface-with-a-deterministic-mock) | Every AI call behind an interface with a deterministic mock | Accepted |
| [005](#adr-005-model-tiers-chosen-by-environment-variable) | Model tiers chosen by environment variable | Accepted |
| [006](#adr-006-voice-onboarding-with-the-browsers-web-speech-api-and-incremental-extraction) | Voice onboarding with the browser's Web Speech API and incremental extraction | Accepted |
| [007](#adr-007-code-decides-eligibility-and-score-claude-only-explains) | Code decides eligibility and score; Claude only explains | Accepted |
| [008](#adr-008-a-curated-seed-of-real-calls-first-bdns-ingest-as-a-cache) | A curated seed of real calls first, BDNS ingest as a cache | Accepted |
| [009](#adr-009-a-live-bdns-catalogue-refreshed-by-an-in-process-scheduler) | A live BDNS catalogue refreshed by an in-process scheduler | Accepted |
| [010](#adr-010-pro-deep-research-claude-finds-candidates-code-decides) | Pro deep research: Claude finds candidates, code decides | Accepted |
| [011](#adr-011-pdf-dossier-with-react-pdfrenderer-and-a-fallback-pdf) | PDF dossier with @react-pdf/renderer and a fallback PDF | Accepted |
| [012](#adr-012-free-layout-the-model-composes-the-dossier-a-deterministic-guard-keeps-it-honest) | Free layout: the model composes the dossier, a deterministic guard keeps it honest | Accepted |
| [013](#adr-013-simulated-jury-anchored-on-the-calls-official-criteria) | Simulated jury anchored on the call's official criteria | Accepted |
| [014](#adr-014-one-tools-module-two-front-doors-mcp-server-and-in-app-agent) | One tools module, two front doors: MCP server and in-app agent | Accepted |
| [015](#adr-015-revenuecat-web-billing-with-server-side-verification-and-a-mock-paywall) | RevenueCat Web Billing with server-side verification and a mock paywall | Accepted |
| [016](#adr-016-deploy-on-flyio-one-machine-one-volume---hafalse) | Deploy on Fly.io: one machine, one volume (`--ha=false`) | Accepted |
| [017](#adr-017-every-push-to-main-deploys) | Every push to `main` deploys | Accepted |
| [018](#adr-018-a-single-shared-profile-behind-optional-basic-auth) | A single shared profile behind optional Basic auth | Superseded by ADR-019 |
| [019](#adr-019-per-user-accounts-the-server-ignores-client-supplied-ids) | Per-user accounts; the server ignores client-supplied ids | Accepted |
| [020](#adr-020-ai-runs-on-the-owners-server-side-key-with-per-user-and-daily-caps) | AI runs on the owner's server-side key, with per-user and daily caps | Accepted |
| [021](#adr-021-invite-codes-for-sign-up-open-sign-up-as-an-option) | Invite codes for sign-up, open sign-up as an option | Accepted |
| [022](#adr-022-a-plan-b-for-every-demo-beat) | A plan B for every demo beat | Accepted |
| [023](#adr-023-from-dark-glassmorphism-to-a-light-design-system-with-skeletons-and-idempotent-writes) | From dark glassmorphism to a light design system with skeletons and idempotent writes | Accepted |
| [024](#adr-024-kind-first-entry-creator-or-pyme-before-signing-in) | Kind-first entry: creator or pyme before signing in | Accepted |
| [025](#adr-025-stretch-features-justification-and-b2b-panel-with-the-money-maths-in-code) | Stretch features: justification and B2B panel, with the money maths in code | Accepted |

---

## ADR-001: Build from a binding spec, shared contracts and parallel work packages

- **Status:** Accepted
- **Date:** 2026-11-13

**Context.** We had about 22 hours, two people and a long feature list (`fleet/IDEA.md`): voice onboarding, works
photos, dossier and PDF, matched calls, paywall, drafting, a simulated jury, an MCP server. Doing it sequentially was
impossible. Running several AI coding agents in parallel was possible, but only if they did not step on each other.

**Decision.** We wrote the product brief (`fleet/IDEA.md`) and a binding spec (`fleet/SPEC.md`) first, then a scaffold
with the shared contracts in `src/contracts/` (zod schemas for the domain, API bodies, tools, AI service and
purchases). The work was split into eleven work packages (`fleet/workpackages/WP-01` to `WP-11`), each owning a
disjoint set of paths, and into two human roles (`fleet/team/PERSONA-A.md` integrates and merges `main`,
`fleet/team/PERSONA-B.md` owns calls, matching, paywall and jury). Builders could not edit the contracts: they wrote
"Contract change requests" in their pull request and the integrator applied them. Risky assumptions were measured
with spikes run alongside the builders, whose results fed back into the work (`fleet/spikes/voice/`).

**Consequences.**
- Seven work packages were merged within about two hours of the scaffold (PRs #3 to #15), most with no conflicts.
- Contract changes went through one person, which kept the types coherent (for example CCR-1/3/5/6 in #14, CCR-7 in
  #16, CCR-8 in #17).
- Integration still hurt where two branches touched the same feature: #18 merged seven pending branches at once; two
  of them needed hand-resolved merges, reviewed adversarially against both parents.
- Later in the day, work was organised by "area" (A to H) instead of WP (for example #36 is area B, #37 area H, #38
  area A) and several pull requests went through independent multi-agent reviews before merging (#33, #36).

**Evidence.** `fleet/IDEA.md`, `fleet/SPEC.md` (Work packages, Contracts), `fleet/workpackages/`, `fleet/team/`;
commits 11745ca (scaffold) and aa7d87c (SPEC and WPs); PRs #3-#6, #9, #12, #15, #18.

---

## ADR-002: Next.js 16 App Router, React 19 and TypeScript as the only stack

- **Status:** Accepted
- **Date:** 2026-11-13

**Context.** The demo had to run on a phone browser (mobile-first), with server routes calling Claude and RevenueCat,
and the team wanted a single language and a single process to deploy.

**Decision.** One Next.js 16 App Router application (React 19, TypeScript, Node 22.12 or newer) serves the pages
under `src/app/` and the JSON API under `src/app/api/`. Business logic lives in `src/features/<feature>/` (service,
AI slice, UI), shared server code in `src/server/`, and every boundary is validated with zod 4. Tests run on Vitest 5
(`npm test`); `npm run check` runs `tsc --noEmit` plus the tests. There is no separate backend.

**Consequences.**
- Next 16 differs from older versions: the request gate is `src/proxy.ts` (the Next 16 `proxy` convention, not
  `middleware.ts`), and `next dev` regenerates `AGENTS.md`, which we commit so the tree stays clean (#48).
- Next 16 no longer ships `next lint` and the repo has no ESLint config, so the type checker is our only static
  analysis (noted in #33). The `lint.yml` workflow runs `npm run typecheck` for that reason.
- Next bundles routes separately, so module-level state is not shared between routes. Counters that must be global
  (the AI daily budget, rate limits) live on `globalThis` (see `src/server/ai/budget.ts`); #33 found and fixed one
  case where this bit us.

**Evidence.** `package.json`, `fleet/SPEC.md` (Architecture: Stack), `src/proxy.ts`, PRs #21, #33, #48.

---

## ADR-003: One JSON file as the database

- **Status:** Accepted
- **Date:** 2026-11-13

**Context.** The brief allowed "SQLite or JSON file". We also wanted the MCP server, a separate process started by
Claude Desktop, to see the same data as the web app without running a database server.

**Decision.** All mutable state is one file, `<MECENA_DATA_DIR>/db.json` (`data/runtime/` locally, `/data` on Fly),
plus uploads and PDF exports in folders next to it. The store (`src/server/store/index.ts`) reads through on every
call, so another process sees each write, and serialises writes in-process with an atomic tmp-file-plus-rename. Call
data is read-only JSON under `data/calls/`. New collections are added to the `Db` schema with `default([])`, so an
older `db.json` still parses with no migration (used in #16, #32, #52, #53, #63).

**Consequences.**
- No database to install or operate; a deploy is just the app plus a volume.
- Writes are only safe within one process on one machine. This is why production runs on exactly one Fly machine
  (ADR-016), and why the CLI scripts that write `db.json` from another process (`npm run invite`, `npm run demo:reset`)
  should not run at the same instant as a sign-up (#63).
- #38 added a read cache keyed on the file's mtime and a `db.json.bak` copy before each rename.
- Some feature state that grows on its own lives in separate files on the same volume instead of `db.json`
  (`calls/bdns-live.json`, `profile-searches.json` and `deep-research.json` from #33, `ai-usage.json` from #38).

**Evidence.** `src/server/store/index.ts` (header comment), `fleet/SPEC.md` (Data model), `.env.example`
(`MECENA_DATA_DIR`), `fly.toml` comment, PRs #33, #38, #63.

---

## ADR-004: Every AI call behind an interface with a deterministic mock

- **Status:** Accepted
- **Date:** 2026-11-13

**Context.** Tests had to run without an API key, builders had to work in parallel without spending money, and the
demo needed to survive bad venue Wi-Fi.

**Decision.** `AiService` (`src/contracts/ai.ts`) is composed from per-feature slices (`src/server/ai/index.ts`), each
with a `real` and a `mock` implementation. The mocks are deterministic Spanish implementations (for example the
onboarding extractor, the works parser and the jury that scores exactly 61 and then 84). The real path goes through one
helper, `structured()` in `src/server/ai/llm.ts`, which returns a zod-validated object and throws `AiError` on refusal
or unparseable output. Mocks are used when `ANTHROPIC_API_KEY` is empty or `MECENA_AI_MOCK=1`; tests always force them.
Where a deterministic answer is safe, the real path degrades instead of failing: the onboarding turn falls back to the
deterministic extractor and the fit explanation to the rules' own text. Drafting does not: it refunds the credit and
reports the error.

**Consequences.**
- `npm run check` needs no key; CI and every contributor can run the full suite (over 1,200 tests by the end).
- The mocks became a product feature: the `/demo` panel can switch one account to simulated AI or to a deterministic
  jury as a plan B (ADR-022).
- A silent fallback can hide a real failure. That happened: the business onboarding schema was rejected by the API on
  every call and pymes silently got the deterministic extractor instead of Claude until #27 found it.
- Optional live smoke tests exist behind `MECENA_LIVE_TESTS=1` and are skipped by default (#27, #33).

**Evidence.** `src/server/ai/index.ts`, `src/server/ai/llm.ts`, `src/contracts/env.ts` (`aiMock`), `.env.example`,
`tests/setup.ts`, PRs #3, #6, #15, #27.

---

## ADR-005: Model tiers chosen by environment variable

- **Status:** Accepted
- **Date:** 2026-11-13, extended on 2026-11-14

**Context.** Different jobs need different trade-offs: an onboarding turn must come back in about two seconds while the
person is still talking; a draft or a jury score can take longer but must be good.

**Decision.** Code asks for a tier rather than a model name. `fast` (`MECENA_MODEL_FAST`, default `claude-sonnet-5-5`, effort
low) covers fit explanations, vision and call structuring; `smart` (`MECENA_MODEL_SMART`, default `claude-opus-5-5`,
effort high) covers drafting, the jury and revisions. Two jobs got their own variable after measurement:
`MECENA_MODEL_ONBOARDING` (default `claude-haiku-5-5`) for live onboarding turns, and `MECENA_MODEL_LAYOUT` (default
`claude-sonnet-5-5` with reasoning on) for the free layout. The jury has its own latency knobs (`MECENA_JURY_TIER`,
`MECENA_JURY_EFFORT`, `MECENA_REVISE_EFFORT`).

**Consequences.**
- Swapping a model is a configuration change, not a code change.
- The Haiku choice came from data: the voice spike measured Haiku at 1.8 s p50 / 2.9 s p95 per extraction against
  2.4 s / 3.4 s for Sonnet, with the same quality on the test transcripts once the correction rule was added to the
  prompt (`fleet/spikes/voice/FINDINGS.md` §3, §6, §8.1). Sonnet also wrote mojibake follow-up questions about 21 % of the time in one run, which Haiku never did (#28).
- Haiku has no server-side refusal fallback, so `structured()` must not send one to it (comment in `llm.ts`).
- #41 moved the three judges and the revision to medium effort, to make the jury beat faster. The judges stay on the
  smart tier unless `MECENA_JURY_TIER=fast` moves them to the fast model (`src/features/jury/ai.ts`).

**Evidence.** `src/server/ai/llm.ts`, `src/contracts/env.ts`, `.env.example`, `fleet/spikes/voice/FINDINGS.md`,
PRs #13, #28, #40, #41, #50.

---

## ADR-006: Voice onboarding with the browser's Web Speech API and incremental extraction

- **Status:** Accepted
- **Date:** 2026-11-13

**Context.** The hero feature: an artist talks for a minute and watches their profile and dossier build themselves.
We had no time for server-side speech-to-text, and latency had to feel live.

**Decision.** The browser transcribes (Web Speech API, `es-ES`, interim results for display only). Every final chunk
becomes a turn that a client `TurnQueue` posts strictly in order to `/api/onboarding/turn`; the server asks the model
for a patch (profile fields plus the dossier sections that changed, citing transcript segment ids) and one follow-up
question. A text input is always available as a fallback. A spike built alongside the feature
(`fleet/spikes/voice/`) measured the approach against the live API, and its findings shaped the prompts, the
pre-warm and the model choice.

**Consequences.** Most of the day's bug fixing happened here:
- **First-call latency:** the first request with a new structured-output schema took about 43 s (grammar compile), so
  the schemas are pre-warmed on `GET /api/onboarding` (#6, #17).
- **Schema too complex:** the business turn schema had 17 optional fields and the API answered `Schema is too complex`
  or timed out after about 112 s; all fields became required with "not said" sentinels that the server strips (#27).
- **Mojibake:** Sonnet sometimes wrote the follow-up question in the wrong code page (`ÂżDĂłnde…?`); the spike drops
  such questions (#28) and the app falls back to a deterministic question (`looksGarbled()` in
  `src/server/ai/wording.ts`, #27).
- **Mobile browsers:** listening stopped after the first answer (stale sessions restarting, fatal errors looping,
  repeated finals on Android, a second microphone opened by the voice orb), fixed in #30; Chrome's `no-speech` errors
  and iPhone Safari's silent session end were fixed in #70 and #72, which opens a fresh session on every question and
  adds a `?voz=debug` on-screen trace. Real-device testing of the iPhone fix was still pending when #72 merged.
- **Privacy:** Chrome sends the audio to Google's services for recognition. The app promises "El arte es tuyo", so it
  discloses this next to the microphone (#6, #40).
- A hung turn no longer blocks the queue: #30 marked turns slow at 12 s and aborted them at 150 s; once the turn
  moved to Haiku, #40 tightened that to 8 s and 60 s (`src/features/onboarding/turnQueue.ts`).

**Evidence.** `fleet/spikes/voice/FINDINGS.md`, `src/components/voice/`, `src/features/onboarding/`, PRs #6, #13, #19,
#25, #27, #28, #30, #31, #40, #58, #64, #70, #72.

---

## ADR-007: Code decides eligibility and score; Claude only explains

- **Status:** Accepted
- **Date:** 2026-11-13

**Context.** "Can I apply to this grant?" is a legal yes/no, not an opinion. If a model decided it, the same profile
could get different answers on different days, and judges or users could not check why.

**Decision.** Matching is deterministic code (`src/features/matching/rules.ts`) on top of a data standard
(`fleet/DATA-STANDARD.md`, `src/features/normalize/`, `data/taxonomy/`) that makes profiles and calls comparable:
canonical disciplines, a territory tree, beneficiary types, CNAE codes, amounts in cents and business-day deadlines.
Hard filters exclude a call; unknown profile data never excludes it and becomes a "Confírmalo: …" line instead. The
score is a visible breakdown shown as alto / medio / bajo, never a "probability of winning". Claude only words the
"why you fit" text and the plain summary, cached per profile and call version, and never changes the score.

**Consequences.**
- Reproducible scores and tests on the real dataset (`tests/matching/`, `tests/normalize/`).
- The weights were tuned in public: #33 lowered the fixed base from 40 to 25 and raised profile affinity so two
  different profiles see clearly different tops; #43 and #47 added proximity, cash prize and residence rules.
- An audit found scores that looked like sure things while requirements were still open; since #56, two or more
  open requirements cap the score at "medio" and the "what you miss" list always comes verbatim from the rules.
- The free plan's monthly quota of three calls must be spent only once the profile is complete, otherwise an empty
  profile locks in generic matches for the month (#44).

**Evidence.** `fleet/DATA-PIPELINE.md` §4, `fleet/DATA-STANDARD.md`, PRs #8, #9, #14, #33, #43, #44, #47, #56.

---

## ADR-008: A curated seed of real calls first, BDNS ingest as a cache

- **Status:** Accepted
- **Date:** 2026-11-13

**Context.** The demo needed real, current calls (convocatorias) with criteria. BDNS (Base de Datos Nacional de
Subvenciones, the Spanish national grants database) has a public API, but criteria and requirements live only in the
bases PDFs, deadlines are often free text, and few artist calls are open in Galicia on any given date.

**Decision.** The source of truth is a hand-verified seed, `data/calls/calls.json`: 25 real calls read from their bases
on 2026-11-13 (#12) and 12 more on 2026-11-14 (#43), each with its source in `data/calls/SOURCES.md`. `npm run
calls:ingest` pulls BDNS records into `bdns-cache.json` (raw cache, filters, Claude structuring, schema validation)
and keeps the previous cache on any failure. Past editions and awards for "ganadores parecidos" come from BDNS and
official resolutions (`npm run calls:history`, #11). The spec ruled out calling BDNS live on stage: the curated seed
is the demo's source of truth.

**Consequences.**
- The feed is never empty in the demo, and every call links to its official bases.
- Honest gaps are written down instead of hidden: no open, verifiable Galician digitalisation aid existed in November
  2026, so those programmes are marked `recurring` (#12); #43 lists what could not be verified.
- The data standard needed fixes from real data: BDNS `regiones` is the impact area, not a residence requirement (#12).

**Evidence.** `data/calls/`, `scripts/ingest-bdns.ts`, `scripts/ingest-history.ts`, `fleet/DATA-PIPELINE.md`,
PRs #1, #11, #12, #43.

---

## ADR-009: A live BDNS catalogue refreshed by an in-process scheduler

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** With only the curated seed, almost every profile saw the same list. We wanted searches shaped by each
profile, without a second piece of infrastructure.

**Decision.** When a profile is completed or updated, a background BDNS search derived from it runs (debounced, once
per 24 h per query signature) and new calls are structured by Claude into a shared, public-data-only catalogue,
`<MECENA_DATA_DIR>/calls/bdns-live.json`. A daily refresh runs from a timer started in `src/instrumentation.ts`, with
the last successful run stored on the volume so a restart neither skips nor repeats a day. `npm run calls:sweep`
(#54) sweeps BDNS nationally for creators with cheap title and beneficiary pre-filters before any Claude call.
`MECENA_CALLS_LIVE` turns it on or off.

**Consequences.**
- No cron endpoint, secret or external scheduler. We rejected a GitHub Actions cron because it is delayed, is disabled
  after 60 days of inactivity and would need a protected public endpoint (#33).
- This only works because there is exactly one always-on machine (ADR-016).
- Claude spend is capped: 12 structurings per profile search, 40 per refresh, 100 a day; a known call is never paid
  for twice. In a dry run, 4,735 BDNS records became 101 Claude candidates after the free filters (#54).
- Without `ANTHROPIC_API_KEY` it stays off by default (unless forced with `MECENA_CALLS_LIVE=1`), so mock output does
  not fill the catalogue. Calls found this way are labelled «BDNS, sin revisión manual».

**Evidence.** `src/instrumentation.ts`, `src/features/calls-ingest/`, `scripts/sweep-bdns.ts`, `.env.example`
(`MECENA_CALLS_LIVE`), PRs #33, #54.

---

## ADR-010: Pro deep research: Claude finds candidates, code decides

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** Many prizes and residencies for artists are private and never reach BDNS.

**Decision.** «Busca más para mí» (Pro) runs Claude with web search in the background for that profile. Claude only
proposes candidates; code accepts one only if it passes the `Call` schema, its URL is http(s) on a site that really
appeared in the search, its deadline is a real future date (or absent) and it is not already in Mecena. Accepted calls
are shown apart from the feed as `source: "web"` with «Sin verificar: revisa las bases».

**Consequences.** Strict caps (searches, tokens, runs per profile and user per month, a global daily total), all
decided in one serialised step so concurrent requests cannot skip them. Interrupted runs show as interrupted after a
restart. The server takes Pro and the profile from the session only.

**Evidence.** `src/features/deep-research/`, PR #33 (third commit).

---

## ADR-011: PDF dossier with @react-pdf/renderer and a fallback PDF

- **Status:** Accepted
- **Date:** 2026-11-13

**Context.** The dossier is the free lead magnet and must look editorial on a phone, on a projector and on paper, with
Spanish accents, without depending on a headless browser.

**Decision.** The dossier is a pure render of a view model, shown as a web page and rendered to an A4 PDF with
`@react-pdf/renderer`, with the artist's uploaded images read from disk. The editorial templates were designed first as
static HTML (`fleet/design/dossier/`) and ported. Fonts are self-hosted (the same TTFs on screen via `next/font/local`
and in the PDF) so the demo does not depend on Google Fonts. If the renderer fails, `renderFallbackPdf` returns a
minimal PDF: the route never answers 500. Call-specific variants (reordered works, then a call-adapted rewrite in
#16) are a Pro feature.

**Consequences.** Server-side PDF rendering is CPU-heavy: PDF-rendering tests timed out several times in full runs on
a heavily loaded development machine and passed in isolation (#37, #38, #39). The app's global `.sheet` styles leaked into the
dossier and had to be neutralised (3eb960a). Crop and rotation of works are applied visually and kept in the PDF;
the original photo is never altered (#4, #42).

**Evidence.** `src/features/dossier/`, `fleet/design/dossier/`, PRs #5, #16, #42.

---

## ADR-012: Free layout: the model composes the dossier, a deterministic guard keeps it honest

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** Templates make every artist's dossier look the same. We wanted the model to design each dossier page by
page from the works, the discipline and how the artist imagines it ("maquetación libre"), without ever inventing
content.

**Decision.** An "art direction" call picks N distinct directions, then N layout calls run in parallel
(`MECENA_LAYOUT_COUNT`, default 2 since #66, maximum 4). The model returns a flat "wire" schema; a deterministic guard
then clamps everything to the printable area, handles overflow, keeps images undistorted, enforces contrast, allows
only works the artist uploaded and only text from the catalogue or a literal quote, and requires a real dossier (name
on the cover, statement, enough distinct works; #62). Each proposal is also rendered for real before it is shown. The
artist picks one and asks for changes in natural language, with undo. Since #66 the first design is a free layout,
generated automatically from the new interview question «¿Cómo te imaginas tu dossier?». Without a key, or if every
proposal fails, the template design stays.

**Consequences.**
- The API rejected the strict schema ("grammar too large", more than 24 optional fields), hence the flat wire schema
  validated afterwards against the strict one (#50).
- The real render check found that IBM Plex Mono broke react-pdf, so that font was removed (#50).
- Generation runs as a background job because Fly cuts long connections; the POST returns at once and the panel polls.
  Jobs live in memory, so a deploy in the middle loses them: one change was lost in production when a merge restarted
  the machine (#62).
- Measured cost per batch of three: 22-39 s and roughly 23-38k input / 6-11k output tokens (#50). Daily caps per
  profile plus the `dossier-layout` and `dossier-layout-batch` rate limits keep it bounded.
- Real PDFs were reviewed "with a designer's eyes" and the defects fixed mostly in deterministic code, plus a few
  prompt rules and guard-driven retries (minimum print sizes, captions next to their works, no work repeated, no
  orphan headings), without switching models (#62, #67).

**Evidence.** `src/features/dossier/layout/`, `.env.example` (`MECENA_MODEL_LAYOUT`, `MECENA_LAYOUT_COUNT`,
`MECENA_FREE_LAYOUT_DEFAULT`), PRs #50, #59, #61, #62, #66, #67.

---

## ADR-013: Simulated jury anchored on the call's official criteria

- **Status:** Accepted
- **Date:** 2026-11-13

**Context.** The jury is the one place where Claude does score, because it judges the quality of a text, not
eligibility. The demo beat is a score rising from 61 to 84, and the obvious question from judges is "is 84 real?".

**Decision.** Three judge personas, chosen by applicant kind, score the draft in parallel against the call's
published criteria and weights; scores are clamped, averaged and normalised to 100. Calls without published criteria
use estimated criteria and say so. Each weak criterion gets concrete fixes; «Aplicar mejoras» revises only with facts
the user already gave (or adds now), never invented ones, and can be undone. Drafts quote the user's transcript and
mark gaps as `[Completa: …]`. The deterministic mock gives exactly 61 for a draft and 84 after a real revision.

**Consequences.**
- #41 made it honest and faster: estimated criteria flagged everywhere, idempotent improve, a full diff, undo, judges
  at medium effort.
- Gating: Pro has unlimited runs; without Pro an application includes five jury passes, counted atomically (#36).
- A disclaimer that the score is orientative appears with every result.

**Evidence.** `src/features/jury/`, `src/features/drafting/`, `fleet/DATA-PIPELINE.md` §5, PRs #15, #36, #41.

---

## ADR-014: One tools module, two front doors: MCP server and in-app agent

- **Status:** Accepted
- **Date:** 2026-11-13, remote endpoint on 2026-11-14

**Context.** We wanted Claude Desktop and Claude Code to drive Mecena ("hazme el dossier para la convocatoria X") and
also an assistant inside the app, without writing the logic twice.

**Decision.** One module, `src/tools/registry.ts`, defines eight tools (`get_profile`, `update_profile`,
`build_dossier`, `export_dossier_pdf`, `search_calls`, `explain_call`, `draft_application`, `score_application`). The
MCP server (`src/mcp/server.ts`, official TypeScript SDK) exposes them over stdio (`npm run mcp`, acting as the account
in `MECENA_USER_EMAIL`), and since #37 over Streamable HTTP at `/api/mcp` with personal `mcn_…` tokens generated in
«Cuenta → Conectar con Claude» (only the hash is stored). The in-app agent (`/api/agent`, «Pregúntale a Mecena») runs a
tool-use loop over the same functions.

**Consequences.**
- The tools must respect the same paywalls and limits as the app: free monthly matches, Pro-only variants and the
  per-user AI limits all apply through MCP (#37, `fix(tools)` commits).
- The stdio server must work from any working directory and log only to stderr, because Claude Desktop starts it from
  elsewhere; a test spawns it the same way (#3).
- `export_dossier_pdf` stopped returning the server file path so no internal path leaks (#37).

**Evidence.** `src/tools/`, `src/mcp/`, `docs/mcp.md`, `docs/claude_desktop_config.example.json`, PRs #3, #37.

---

## ADR-015: RevenueCat Web Billing with server-side verification and a mock paywall

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** Monetisation was a target (RevenueCat is a sponsor) and had to be real, in sandbox. A paywall that the
client can unlock by itself is not real monetisation.

**Decision.** The paywall uses `@revenuecat/purchases-js` (Web Billing) with our own app user id per account. Plans
come from the `default` offering: Pro monthly and annual subscriptions grant the entitlement `mecena_pro`, and a
one-off «Solicitud premium» grants one premium credit. The server never trusts the client: with
`REVENUECAT_SECRET_API_KEY` it reads the subscriber from the RevenueCat REST API; a mock mode exists only when
`NODE_ENV` is not production and `NEXT_PUBLIC_PURCHASES_MOCK=1`; otherwise it refuses the claim. Without a public key
the app shows a mock paywall («Modo prueba», nothing charged) so it runs anywhere.

**Consequences.**
- The first version (#20) trusted the client when no secret key was set; the hardening in #36 closed that, made the
  premium credit atomic (reserved before the AI call, refunded on failure), added «Restaurar compras» and expiry
  checks.
- The dashboard used `mecena_pro`, not the `pro` from the spec, so the entitlement id became configurable (#24).
- Prices moved from the brief's 9 €/79 € to the live dashboard prices; the paywall now formats them from RevenueCat and
  the fallback shows 3,99 €/mes and 35,88 €/año (#23, #45, #57).
- On phones the embedded checkout was squeezed into a 120 px box, so it now opens full screen (#44).
- `NEXT_PUBLIC_*` values are inlined at build time, so they are Docker build arguments (ADR-016).

**Evidence.** `src/features/purchases/`, `docs/revenuecat.md`, `.env.example`, `Dockerfile`, PRs #20, #23, #24, #36,
#44, #45.

---

## ADR-016: Deploy on Fly.io: one machine, one volume (`--ha=false`)

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** The microphone needs HTTPS and the demo phone needed a stable URL instead of a laptop tunnel. The store
is a JSON file with an in-process write queue (ADR-003).

**Decision.** Mecena runs on Fly.io at https://mecena.fly.dev: a two-stage `Dockerfile` (`next build`, then
`next start`) on one machine in `cdg` with a 1 GB volume mounted at `/data`. Deploys use `--ha=false` so Fly never adds
a second machine. `fly.toml` keeps the machine always on (`auto_stop_machines = "off"`, `min_machines_running = 1`)
and health-checks `/api/health` (#38).

**Consequences.**
- We chose Fly over Vercel because on serverless the JSON writes would be lost or split across instances; Fly runs
  the same Node server as local, with a disk (#21).
- No horizontal scaling and no zero-downtime deploys: every deploy restarts the only machine, and in-memory jobs are
  lost (ADR-012).
- A 15-artist concurrency test in a Docker replica of the machine (1 CPU, 1 GB) peaked at 657 MiB with no OOM (#62).

**Evidence.** `Dockerfile`, `fly.toml`, README, PRs #21, #38, #62.

---

## ADR-017: Every push to `main` deploys

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** Deploying from someone's laptop meant only one person could ship, at the busiest moment of the hackathon.

**Decision.** `.github/workflows/deploy.yml` runs `npm run check` on every pull request and push; on a push to `main`
(or a manual run) it then runs `flyctl deploy --remote-only --ha=false` with a deploy token scoped to the app
(`FLY_API_TOKEN`). One deploy runs at a time. The flow is: feature branch → pull request → `main`.

**Consequences.** Merging is deploying. Many pull request descriptions from the demo day carry a warning not to merge
without review for that reason (#33, #50, #68). #63, which changed sign-up, even advised merging only after the demo;
it was merged that afternoon anyway.

**Evidence.** `.github/workflows/deploy.yml`, PR #26.

---

## ADR-018: A single shared profile behind optional Basic auth

- **Status:** Superseded by ADR-019
- **Date:** 2026-11-14

**Context.** The brief (`fleet/IDEA.md`) asked for "no auth beyond a demo user", and the first deploy had to be quick.

**Decision.** `src/proxy.ts` added HTTP Basic auth, on only when `BASIC_AUTH_PASSWORD` is set (#21). Shortly after, the
password was removed on Fly because it got in the way of testing on phones; everyone shared the single profile (#22).

**Consequences.** Two people testing at the same time saw each other's profile. That, plus every AI call spending the
owner's key, led straight to ADR-019. The optional Basic auth remains in `src/proxy.ts`.

**Evidence.** PRs #21, #22, #32 (its "Por qué" section).

---

## ADR-019: Per-user accounts; the server ignores client-supplied ids

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** See ADR-018. Mecena holds personal data (a voice transcript, works, a CV), so profiles must never be
shared.

**Decision.** Email and password accounts with no new dependency: `scrypt` password hashes and an `httpOnly` session
cookie holding a random token of which only the hash is stored (`src/server/auth/`). Every API route, tool, photo and
PDF download takes the user from the session and checks that the resource belongs to them, answering 404 otherwise.
Any `profileId` or `appUserId` sent by the client only selects among the user's own profiles, or is ignored. The
RevenueCat app user id is one per user.

**Consequences.**
- Existing profiles from the single-user era became ownerless and invisible; everyone had to sign up again (#32).
- Hardening came with it: the `?next` redirect cannot leave the site, login attempts are counted atomically, and JSON
  routes refuse cross-site or non-JSON bodies against login CSRF (#32). #38 added account deletion
  («Borrar mi cuenta») and generic error messages.
- Isolation is tested with two users (`tests/auth/isolation.test.ts`).

**Evidence.** `src/server/auth/`, `src/proxy.ts`, PRs #32, #38.

---

## ADR-020: AI runs on the owner's server-side key, with per-user and daily caps

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** Artists should not need an Anthropic account or a Claude plan to use Mecena. The hackathon provided no AI
credits, so every request is paid by the project owner's key, and the URL is public.

**Decision.** There is one server-side `ANTHROPIC_API_KEY` and no bring-your-own-key option anywhere in the app. Spend
is bounded in layers (#38): per-user rate limits on every route that calls Claude (`src/server/ai-limits.ts`, plus a
daily allowance per user across all AI routes), a global daily ceiling of Claude requests counted in Europe/Madrid time
and persisted on the volume (`MECENA_AI_DAILY_CAP`, default 1,500, `src/server/ai/budget.ts`), input size limits on the
API schemas, and feature-specific caps (BDNS structuring, deep research, free layout batches).

**Consequences.** Sign-up has to be controlled too (ADR-021). A user who hits a limit gets a 429 with a Spanish
message asking them to wait. Without a key the whole app still works on the mocks (ADR-004).

**Evidence.** `src/server/ai-limits.ts`, `src/server/ai/budget.ts`, `src/contracts/api.ts` (input ceilings),
`.env.example`, PRs #33, #38, #50.

---

## ADR-021: Invite codes for sign-up, open sign-up as an option

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** With the owner's key paying (ADR-020), strangers should not be able to create unlimited accounts. A single
shared code was a lock with nothing in it for the user and no control if it leaked.

**Decision.** `MECENA_SIGNUP_CODE` started as a single optional code (#32). #63 added codes stored in the database with
a usage cap, an expiry date, a cohort label and gifted premium credits, managed from the CLI
(`npm run invite -- create 1HACK --uses 50 --credits 1`). Redeeming the code, creating the account and granting the gift
happen in one atomic write, so the last seat cannot be taken twice. `MECENA_SIGNUP_OPEN=1` (#65) lets anyone sign up
while a typed code still tags the cohort and gifts its credits.

**Consequences.** Gifted credits are stored apart from purchases (`grantedCredits`), because every RevenueCat sync
recomputes purchased credits and would erase them; a forged purchase claim is still worth zero (#63).

**Evidence.** `src/server/auth/invites.ts`, `scripts/invite.ts`, README, `.env.example`, PRs #32, #63, #65.

---

## ADR-022: A plan B for every demo beat

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** A live demo in under three minutes, on venue Wi-Fi, with a real microphone, a real API and a real
checkout: something would fail.

**Decision.** The `/demo` panel loads server-side scenarios into the signed-in account (an example artist, a Pro artist
with an application, an example pyme), resets the account, and switches the account to a deterministic jury or to
simulated AI. `npm run demo:preflight` checks the deployed app green/red without spending AI. The script with a plan B
per step is `docs/demo-script.md`. When purchases are real (RevenueCat keys set), the demo Pro scenario can only be
loaded by the accounts in `DEMO_EMAILS`, and it is granted on the server, never from a client claim.

**Consequences.** The example works are our own CC0 images generated by code, so no third-party artwork ships in the
repo (#39). The scenarios had to be kept in step with the jury rules (d7733af gave the Pro scenario a budget so the
deterministic jury scores 61 again).

**Evidence.** `src/features/demo/`, `data/demo/`, `scripts/demo-preflight.ts`, `docs/demo-script.md`, PRs #39, #55.

---

## ADR-023: From dark glassmorphism to a light design system with skeletons and idempotent writes

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** The first look was an immersive dark, frosted-glass, mobile-first design (#19, cafda8a). By the afternoon,
the app had many screens with long AI waits and double-tap risks on paid actions.

**Decision.** #68 moved every screen except the dossier document to a light design system documented in
`docs/design-system.md` (Inter self-hosted, pill buttons, white cards), copying only the style of a reference site,
never its name, logo or assets. It also added content-shaped skeleton loaders and idempotency: the client sends an
`Idempotency-Key` on every write and the server (`src/server/idempotency.ts`) replays successful responses for 24 h,
never runs the same request twice concurrently and answers 409 if the same key arrives with different data. #73 then
made a mobile-only layout pass under 640 px.

**Consequences.** A double tap can no longer create two drafts or spend two credits. The redesign landed on demo day
with only partial visual QA of signed-in screens, which the pull request says openly (#68).

**Evidence.** `docs/design-system.md`, `src/components/ui/skeleton.tsx`, `src/server/idempotency.ts`,
`src/lib/use-action.ts`, PRs #19, #68, #73.

---

## ADR-024: Kind-first entry: creator or pyme before signing in

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** Mecena serves two audiences with the same pipeline (`Profile.kind`): creators and pymes/autónomos. The
spec's demo used a one-tap «Creador/a ↔ Pyme» switch in the header, which vanished from the home screen when the header
was hidden there (#34), and which repeated a choice the user had already made.

**Decision.** Signed out, the app starts at `/empezar` with the Mecena logo and two buttons, «Creador/a» and «Pyme o
autónomo/a», which lead to `/entrar?perfil=creador|pyme`; the account's first profile is created with that kind (#74).
The onboarding no longer offers the switch, and #75 removed the header switch entirely.

**Consequences.** The first screen asks one clear question before any form. `/api/profile/mode` still exists, so the
kind can still change programmatically.

**Evidence.** `src/app/empezar/page.tsx`, `src/proxy.ts`, PRs #34, #74, #75.

---

## ADR-025: Stretch features: justification and B2B panel, with the money maths in code

- **Status:** Accepted
- **Date:** 2026-11-14

**Context.** The brief listed grant justification and a panel for schools and associations as stretch items, and the
spec's cut list put them first to drop (as a pitch slide only). The core was in place by midday, so both were built.

**Decision.** Justification (`/justificacion/<applicationId>`, #53): a photo of an invoice is read by vision (or by a
mock that never invents a tax id, number or date), assigned to a budget line by deterministic rules, and checked for
deviations; Claude writes only the narrative of the final memoria, while the amounts, lines and list of invoices are
generated in code. The B2B panel (`/panel`, #52) is consent-based: nothing is visible until the invited person accepts
and picks which of their own profiles to share, and the organisation sees only a projection (name, discipline, place,
matched calls), never the dossier, works, transcript or drafts.

**Consequences.** Both are deliberately small: one organisation per account, no email delivery, no PDF export of the
memoria (it downloads as .txt), no MCP tool yet. Their limits are listed in the pull requests.

**Evidence.** `src/features/justification/`, `src/features/panel/`, PRs #52, #53, #55.
