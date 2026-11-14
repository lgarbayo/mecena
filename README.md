# Mecena

[![build](https://github.com/lgarbayo/mecena/actions/workflows/build.yml/badge.svg)](https://github.com/lgarbayo/mecena/actions/workflows/build.yml)
[![test](https://github.com/lgarbayo/mecena/actions/workflows/test.yml/badge.svg)](https://github.com/lgarbayo/mecena/actions/workflows/test.yml)
[![lint](https://github.com/lgarbayo/mecena/actions/workflows/lint.yml/badge.svg)](https://github.com/lgarbayo/mecena/actions/workflows/lint.yml)
[![security](https://github.com/lgarbayo/mecena/actions/workflows/security.yml/badge.svg)](https://github.com/lgarbayo/mecena/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!--
OpenSSF Scorecard: .github/workflows/security.yml publishes the results (publish_results: true), so this badge
starts working after the first run of that workflow on main. Uncomment it once
https://scorecard.dev/viewer/?uri=github.com/lgarbayo/mecena shows a score.
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/lgarbayo/mecena/badge)](https://scorecard.dev/viewer/?uri=github.com/lgarbayo/mecena)
-->
<!--
OpenSSF Best Practices: the project is not registered yet. Sign in at https://www.bestpractices.dev/en/projects/new
with the GitHub account that owns the repo, add https://github.com/lgarbayo/mecena, and paste here the badge
Markdown that the site shows on the project page (it contains the project number the site assigns).
-->

**Tú creas. Mecena se encarga del papeleo.** Artists, illustrators, photographers and small businesses in Spain lose public and private funding because they never hear about the right call in time, or because the paperwork (memoria, dossier, budget, justification) is a job of its own. Mecena is a mobile-first web app with an AI agent that does that paperwork with them: you talk about your work (by voice or text) and photograph it, and Mecena builds your profile and your dossier, finds the real calls you fit (with why you fit and what you are missing), drafts the application in your own words, scores it against the call's official criteria with a simulated jury, and later helps you justify the grant. **Mecena prepares; you submit**: it never applies on anyone's behalf and never generates or modifies artwork.

Built for **1hack-2026** (2026-11-13 / 2026-11-14) by a two-person team. The product UI is in Spanish (Spain); code, commits and docs are in English.

## Contents

- [Live app](#live-app)
- [Features](#features)
- [Quickstart (local)](#quickstart-local)
- [Usage examples](#usage-examples)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Accounts, invite codes and limits](#accounts-invite-codes-and-limits)
- [Deploy](#deploy)
- [Día de demo](#día-de-demo)
- [Supported platforms and environments](#supported-platforms-and-environments)
- [Troubleshooting](#troubleshooting)
- [Support](#support)
- [Contributing and project documents](#contributing-and-project-documents)
- [License](#license)

## Live app

**https://mecena.fly.dev** (open it on your phone in Chrome or Safari: dictation needs a real browser, not an in-app preview).

Sign-up on the live app is invite-only (every AI call spends the owner's Anthropic key): see [Accounts, invite codes and limits](#accounts-invite-codes-and-limits). To try everything without a code, run it locally: it takes two minutes and needs no API key.

## Features

- **Choose your profile first.** The app starts by asking whether you are a *Creador/a* (artist, illustrator, photographer, musician...) or a *Pyme o autónomo/a*, then you sign in. Both modes run the same pipeline. One account can hold both profiles: the choice made on that first screen before signing in decides which one you work with.
- **Voice onboarding that builds your profile and dossier live.** The browser's Web Speech API (es-ES) transcribes you, and each turn goes to Claude, which fills the structured profile and grows the dossier section by section next to the transcript. Browsers without speech recognition get a text field instead. You can also import a dossier you already have (`/api/onboarding/import`).
- **Works from photos** (`/obras`). Photograph a work, dictate its title, year, technique and size, and Mecena writes its technical sheet. Mecena only suggests a crop and a straightening, shown over your untouched photo ("Ver original" removes it); the artwork itself is never altered.
- **Dossier and PDF** (`/dossier`). Template designs or a free, page-by-page layout composed by the model, exported to PDF with `@react-pdf/renderer`. With Mecena Pro, the dossier adapts to a specific call (order, image limit, texts according to its criteria).
- **Matched calls feed** (`/convocatorias`). 37 real, hand-verified calls in `data/calls/calls.json` (sources in [`data/calls/SOURCES.md`](data/calls/SOURCES.md)) plus a live catalogue searched in BDNS (Base de Datos Nacional de Subvenciones) for each profile. Each card shows amount, deadline, *Por qué encajas* and *Qué te falta*, a plain-language summary of the bases, and past awards of earlier editions ("Ganadores parecidos a ti").
- **Pro "Busca más para mí".** A background Claude run with web search per profile, shown as "Sin verificar".
- **"Prepárame la solicitud"** (`/solicitud/<callId>`). Memoria, statement, budget lines and document checklist, written from your own words (each section shows which of your sentences it used).
- **Simulated jury** (`/tribunal/<applicationId>`). Three AI judges score the draft against the call's official criteria and weights; "Aplicar mejoras" revises it and the score rises (the demo goes 61 → 84). Always shown as orientative.
- **Justification** (`/justificacion/<applicationId>`). Photograph an invoice, Mecena reads it, assigns it to a budget line, warns about deviations and drafts the final memoria.
- **B2B panel** (`/panel`) for schools and associations: members who accepted an invitation, their open matching calls and upcoming deadlines.
- **Monetisation with RevenueCat Web Billing** (`/pro`): Mecena Pro (monthly, annual) and a one-off *Solicitud premium*, verified server side. Details in [`docs/revenuecat.md`](docs/revenuecat.md).
- **Ask Mecena and MCP.** The in-app agent ("✦ Pregúntale", `POST /api/agent`) and an MCP server share the same 8 tools (`get_profile`, `update_profile`, `build_dossier`, `export_dossier_pdf`, `search_calls`, `explain_call`, `draft_application`, `score_application`), so Claude Desktop or Claude Code can drive your Mecena account. Guide (Spanish): [`docs/mcp.md`](docs/mcp.md).
- **Works without keys.** Every AI call has a deterministic mock and purchases have a mock adapter, so the whole app and its test suite run offline.
- **Per-user accounts.** Each account sees only its own profiles, works, dossiers, applications and purchases.

## Quickstart (local)

You need **Node.js 22.12 or newer** (`node -v`) and npm.

```sh
git clone https://github.com/lgarbayo/mecena.git
cd mecena
npm install
cp .env.example .env.local   # optional: the defaults run everything on mocks
npm run dev                  # http://localhost:3000
```

Then, in the browser:

1. Open http://localhost:3000. Signed out, it sends you to `/empezar`: pick **Creador/a** or **Pyme o autónomo/a**.
2. On `/entrar`, choose **Crear cuenta**, type any email and a password of at least 8 characters. Locally, with no `MECENA_SIGNUP_CODE` and no invite codes in your database, no invite code is needed.
3. Answer the interview by voice or text. Without `ANTHROPIC_API_KEY` the answers are processed by deterministic mocks: good for trying the flow, not for judging the AI.

Check that everything is green before you open a pull request:

```sh
npm run check        # typecheck + tests
```

To use real AI, put your key in `.env.local` (`ANTHROPIC_API_KEY=sk-ant-...`) and restart `npm run dev`. Your data lives in `./data/runtime` (git-ignored).

**On a phone over HTTPS.** Dictation and the camera need HTTPS (or `localhost`). Start the dev server on your network with `npm run dev:phone` and open it through an HTTPS tunnel such as `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000` (`next.config.ts` already allows `*.trycloudflare.com` and `*.ngrok-free.app` dev origins). Set `MECENA_PUBLIC_URL` to the tunnel URL so the links the MCP server returns open on the phone.

## Usage examples

**1. A creator, from interview to PDF.** Open `/`, choose *Creador/a*, create your account and start the interview, choosing *Hablando* (voice) or *Escribiendo* (text). Answer the six questions ("Soy ilustradora en Vigo, trabajo con tinta y acuarela sobre el mar..."). The profile chips and the dossier fill in as you speak. Then *Fotografiar mi obra* → take the photo → *Dictar* ("Marea baja, 2025, acuarela, 30 por 40") → *Crear ficha*. Open `/dossier` and press *Descargar PDF*.

**2. Find calls and prepare an application.** From the dossier, the *Convocatorias* button (*Ayudas* for a business) opens `/convocatorias`. Open a call to read its bases in plain language, then *Prepárame la solicitud*. Without Pro or a *Solicitud premium* credit you see the paywall; locally it runs in *Modo prueba* (`NEXT_PUBLIC_PURCHASES_MOCK=1`), so a simulated purchase unlocks the draft. Then *Pasar el tribunal simulado* → read the per-criterion feedback → *Aplicar mejoras*.

**3. A small business.** Choose *Pyme o autónomo/a* on the first screen (an existing account moves to its pyme profile by signing out and signing back in with that choice). The interview asks what you do, where you are and how many you are, a project you are proud of, your approximate turnover (only if you want) and what you need now; the dossier becomes the company's memoria, and the feed shows SME and autónomo aid.

**4. Jump to a ready-made state.** Signed in, open `/demo` and load a scenario: *Empezar de cero*, *Artista de ejemplo*, *Artista Pro con solicitud* (an application scored 61 → 84 and three invoices already assigned) or *Pyme de ejemplo*; every scenario also fills the example school's `/panel`. It only touches the signed-in account. The *IA simulada para esta cuenta* switch puts just your account on mocks.

**5. Drive Mecena from Claude.** On the live app: *Cuenta → Conectar con Claude → Crear token*, then in Claude Code:

```sh
claude mcp add --transport http mecena https://mecena.fly.dev/api/mcp \
  --header "Authorization: Bearer mcn_PEGA_AQUI_TU_TOKEN"
```

and ask "¿Qué convocatorias encajan conmigo?" or "Hazme el dossier para los Premios Qué! Arte y pásamelo en PDF." Against your local data instead: `MECENA_USER_EMAIL=you@example.com npm run mcp` (stdio). Claude Desktop setup, limits and troubleshooting: [`docs/mcp.md`](docs/mcp.md).

**6. Refresh the calls catalogue by hand** (the running server already does it once a day):

```sh
npm run calls:ingest -- --max 20          # BDNS -> data/calls/bdns-cache.json (keeps the old cache on any error)
npm run calls:sweep -- --dry-run          # national culture sweep: what would enter, no Claude calls, no writes
npm run calls:history                     # past editions and awards -> data/calls/history.json, awards.json
```

**7. Admin tasks.**

```sh
npm run invite -- create 1HACK --label 1hack-2026 --uses 50 --credits 1 --expires 2026-12-31
npm run demo:reset                        # wipes the whole local database, every account included
MECENA_DEMO_EMAIL=... MECENA_DEMO_PASSWORD=... npm run demo:preflight   # is mecena.fly.dev ready for the stage?
npm run demo:images                       # regenerates the CC0 example artworks in data/demo/works
```

## Architecture

One Next.js 16 (App Router) server, written in TypeScript, that serves the pages and the API, keeps its data in a JSON file on disk and calls three external services: Anthropic (Claude), RevenueCat and BDNS.

```mermaid
flowchart TB
  subgraph clients["Clients"]
    browser["Browser, phone first<br/>pages in src/app: / /empezar /entrar /onboarding /obras<br/>/dossier /convocatorias /solicitud /tribunal /justificacion<br/>/panel /pro /cuenta /demo /confianza<br/>Web Speech API dictation"]
    rcsdk["RevenueCat Web SDK<br/>@revenuecat/purchases-js"]
    claudeapps["Claude Desktop / Claude Code"]
  end

  subgraph server["Next.js server (next start, port 3000)"]
    proxy["src/proxy.ts<br/>optional Basic auth + session gate"]
    api["API routes src/app/api/*<br/>auth, profile, onboarding, works, dossier, calls,<br/>applications, jury, justification, panel, entitlements, agent"]
    mcphttp["/api/mcp<br/>remote MCP, Bearer mcn_ token"]
    tools["src/tools/registry.ts<br/>8 shared tools"]
    features["Feature services src/features/*<br/>onboarding, works, dossier, matching, drafting,<br/>jury, justification, purchases, deep-research, panel"]
    ai["src/server/ai + src/server/ai-limits.ts<br/>per-user limits + daily cap"]
    sched["src/instrumentation.ts<br/>daily BDNS refresh, in process"]
    store["src/server/store<br/>JSON db"]
  end

  mcpstdio["npm run mcp<br/>src/mcp/server.ts, stdio"]
  anthropic[("Anthropic API<br/>Claude")]
  mocks["Deterministic mocks<br/>no key, MECENA_AI_MOCK=1<br/>or IA simulada"]
  rcrest[("RevenueCat REST v1")]
  bdns[("BDNS API<br/>infosubvenciones.es")]
  disk[("MECENA_DATA_DIR<br/>db.json, db.json.bak, uploads, exports,<br/>calls/bdns-live.json, ai-usage.json<br/>Fly volume at /data")]
  curated[("data/calls, read-only<br/>calls.json 37 curated calls,<br/>awards.json, history.json")]

  browser --> proxy --> api
  browser --> rcsdk
  claudeapps --> mcphttp
  api --> features
  api -- "POST /api/agent" --> tools
  mcphttp --> tools
  mcpstdio --> tools
  tools --> features
  features --> ai
  ai -- "key set" --> anthropic
  ai -- "otherwise" --> mocks
  features --> store
  store --> disk
  features --> curated
  features -- "live search per profile" --> bdns
  sched --> bdns
  features -- "verify purchases" --> rcrest
```

How the pieces fit:

- **Pages and API.** `src/app` holds the Spanish-slug pages and the route handlers under `src/app/api`. `src/proxy.ts` puts the optional Basic password in front of everything and sends signed-out visitors to `/entrar`; every handler validates the session itself (`src/server/auth`) and only touches the signed-in user's data. The contracts shared by client and server (zod schemas, routes, env names) live in `src/contracts`.
- **AI.** Feature `ai.ts` files call Claude through `src/server/ai` (`@anthropic-ai/sdk`): a fast tier (`MECENA_MODEL_FAST`) for extraction and short answers, a smart tier (`MECENA_MODEL_SMART`) for drafting and the jury, and `MECENA_MODEL_ONBOARDING` for the live interview. Every call is charged against per-user limits (`src/server/ai-limits.ts`) and a global daily cap (`src/server/ai/budget.ts`). With no key, with `MECENA_AI_MOCK=1` or with an account's *IA simulada* switch on, the same interface answers with deterministic mocks.
- **Data.** `src/server/store` keeps everything in `<MECENA_DATA_DIR>/db.json`, written atomically and serialised in process, with a `.bak` copy of the previous version. That is why production runs on exactly one machine. Uploads (work photos, invoices) and PDF exports sit next to it.
- **Calls.** The curated calls in `data/calls` are read-only. `src/features/calls-ingest` searches BDNS in the background for each profile and refreshes a shared catalogue once a day (`src/instrumentation.ts`), structuring each record with Claude; `src/features/normalize` turns BDNS records into the call model the matcher (`src/features/matching`) scores.
- **Purchases.** The browser buys through RevenueCat Web Billing; the server re-reads the customer from RevenueCat REST v1 with the secret key and ignores what the client claims (`src/features/purchases/server.ts`).
- **Tools and MCP.** `src/tools/registry.ts` is the single implementation behind the in-app agent, the remote MCP endpoint (`src/mcp/http.ts`, stateless Streamable HTTP) and the local stdio server (`src/mcp/server.ts`). Paywalls are the app's own: tools cannot get around them.

Design decisions and the reasons behind them: [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md). Visual language: [`docs/design-system.md`](docs/design-system.md).

## Configuration

All settings are environment variables. [`.env.example`](.env.example) documents every one of them; copy it to `.env.local` (git-ignored, loaded by Next.js and by the MCP server) and fill in only what you need. Empty values keep the defaults.

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | empty | Claude API key. Empty = every AI call runs on deterministic mocks. |
| `MECENA_AI_MOCK` | empty | `1` forces mocks even with a key (the tests always set it). |
| `MECENA_MODEL_FAST` / `MECENA_MODEL_SMART` | `claude-sonnet-5-5` / `claude-opus-5-5` | Models of the fast and smart tiers. |
| `MECENA_MODEL_ONBOARDING` | `claude-haiku-5-5` | Model for each live interview turn (latency-bound). |
| `MECENA_MODEL_LAYOUT`, `MECENA_LAYOUT_COUNT`, `MECENA_FREE_LAYOUT_DEFAULT` | `claude-sonnet-5-5`, `2` (max 4), on | Free dossier layout: model, proposals per batch, and whether it is on by default (`0` = off). |
| `MECENA_JURY_TIER`, `MECENA_JURY_EFFORT`, `MECENA_REVISE_EFFORT` | smart tier, `medium`, `medium` | Simulated jury latency knobs (`MECENA_JURY_TIER=fast` moves the judges to the fast model; efforts: `low`, `medium`, `high`). |
| `MECENA_AI_DAILY_CAP` | `1500` | Global ceiling of Claude requests per day for everyone together; `0` = no ceiling. |
| `NEXT_PUBLIC_REVENUECAT_API_KEY` | empty | RevenueCat Web Billing public key (sandbox: `rcb_sb_...`). Empty = mock paywall. Build time. |
| `REVENUECAT_SECRET_API_KEY` | empty | RevenueCat secret key (`sk_...`), server only. Required wherever real purchases happen. |
| `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID` / `NEXT_PUBLIC_REVENUECAT_OFFERING_ID` | `mecena_pro` / `default` | Entitlement and offering identifiers. Build time. |
| `NEXT_PUBLIC_PURCHASES_MOCK` | `1` in `.env.example` | `1` = *Modo prueba*: mock purchases, granted only when `NODE_ENV` is not `production`. Build time. |
| `MECENA_DATA_DIR` | `./data/runtime` | Where the JSON database, uploads and PDF exports live (`/data` on Fly). |
| `MECENA_PUBLIC_URL` | `http://localhost:3000` | Base URL of the links the MCP tools return. |
| `MECENA_SIGNUP_CODE` | empty | Default invite code; when set, creating an account requires a code. |
| `MECENA_SIGNUP_OPEN` | empty | `1` = open sign-up; invite codes become optional and still gift credits. |
| `MECENA_USER_EMAIL` | empty | MCP stdio server only: the account the tools act as. Required by `npm run mcp`. |
| `DEMO_EMAILS` | empty | Comma-separated stage accounts allowed to load the *Artista Pro con solicitud* scenario when purchases are real. |
| `MECENA_CALLS_LIVE` | on when a key is set and `MECENA_AI_MOCK` is not `1` | `0` turns off the live BDNS searches and the daily refresh; `1` forces them on even with mocks. |
| `BDNS_API_BASE` | `https://www.infosubvenciones.es/bdnstrans/api` | BDNS API base URL. |
| `MECENA_CALLS_DIR` / `MECENA_SEED_FILE` | `./data/calls` / `./data/demo/seed.json` | Data locations (tests override them). |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | `mecena` / empty | Optional HTTP Basic password in front of the whole site (only on when the password is set). |

`NEXT_PUBLIC_*` values are inlined into the client bundle at build time: restart `npm run dev` after changing them, and pass them as build arguments in production (see [Deploy](#deploy)).

## Accounts, invite codes and limits

These rules apply wherever Mecena runs; the commands below show the live deployment on Fly.

**Accounts.** Everyone signs in at `/entrar` with an email and a password ("Crear cuenta" the first time). Each account has its own profiles (creator and pyme), transcripts, works and photos, dossiers and PDFs, applications, jury scores, usage and Mecena Pro / credits (its own RevenueCat app user id): nobody sees anyone else's data. Sessions are an httpOnly cookie (30 days); passwords are hashed with scrypt; the JSON store keeps only a hash of each session token. "Salir" in the header signs out.

**Invite codes.** Every AI call spends the owner's Anthropic key, so sign-up is invite-only in production: only people with a valid code can create an account (existing accounts keep signing in normally). Two kinds, usable together:
- `MECENA_SIGNUP_CODE` (Fly secret): one plain code, no cap, no gift; its accounts get the cohort `default`. Change it with `fly secrets set MECENA_SIGNUP_CODE=... -a mecena`.
- Codes in the database, managed with `npm run invite` (on Fly: `fly ssh console -C "sh -c 'cd /app && npx tsx scripts/invite.ts <command>'"`). Each one can cap how many accounts use it, expire, tag its accounts with a cohort (`signupCohort`, for attribution) and **gift Solicitud premium credits** to every new account:
  `npm run invite -- create 1HACK --label 1hack-2026 --uses 50 --credits 1 --expires 2026-12-31` · `npm run invite -- list` · `npm run invite -- delete 1HACK`.
  Codes are case-insensitive. The gift is kept apart from purchases (`grantedCredits`), so a RevenueCat sync never wipes it; a wrong, expired or used-up code gets its own message at sign-up.

Neither set = open sign-up. `MECENA_SIGNUP_OPEN=1` (`fly secrets set MECENA_SIGNUP_OPEN=1 -a mecena`) opens sign-up while keeping the codes: the field shows as optional, an empty code creates a plain account, and a typed code is still checked and still tags the cohort and gifts its credits. Invite codes survive `npm run demo:reset`.

**AI spending limits.** Every route that calls Claude has a per-user rate limit (`src/server/ai-limits.ts`: e.g. 90 onboarding turns per 15 min, 20 jury runs per hour, 600 AI requests per user per day) and answers 429 with a Spanish message past it. A real session or a rehearsal never gets near them. On top, a global ceiling of Claude requests per day for everyone together (`MECENA_AI_DAILY_CAP`, default 1500; `src/server/ai/budget.ts`, persisted in `/data/ai-usage.json`). Request bodies are capped too (1 MB by default; texts at 4,000 characters, agent history at 20 turns).

**Sign-in limits.** 10 failed attempts per email from one IP every 15 minutes, and 100 per IP (a venue's Wi-Fi puts everyone behind one address). Successful logins and sign-ups do not count.

**Password gate (optional).** `fly secrets set BASIC_AUTH_USER=... BASIC_AUTH_PASSWORD=...` puts an HTTP Basic password in front of the whole site, before the account login (`src/proxy.ts` turns it on only when the password is set).

**Resetting data.** `/demo` → "Empezar de cero" resets only the signed-in account's data (and gives it a fresh RevenueCat id so the paywall shows again). `npm run demo:reset` on the machine is the admin reset: it wipes the whole database, every account included. A `db.json` from the single-user days still loads: its old profiles simply belong to nobody.

## Deploy

Fly.io, one machine with a persistent volume (`mecena_data` mounted at `/data`, `MECENA_DATA_DIR=/data`), configured in `fly.toml` and `Dockerfile`.

Every push to `main` deploys automatically: `.github/workflows/deploy.yml` runs `npm run check` and then `flyctl deploy`, using the repo secret `FLY_API_TOKEN` (a deploy token scoped to the app). Nobody needs a Fly account to ship: merge to `main`. You can also re-run it by hand from the Actions tab ("Deploy to Fly" > Run workflow).

Deploying by hand still works if you have access to the Fly app:

```sh
fly deploy --ha=false --remote-only   # --ha=false: db.json needs exactly one machine
```

The token expires in a year (Nov 2027). To renew it: `fly tokens create deploy -a mecena -x 8760h | gh secret set FLY_API_TOKEN`.

- Secrets (runtime, `fly secrets list -a mecena`):
  - `ANTHROPIC_API_KEY`: without it the app silently falls back to AI mocks.
  - `REVENUECAT_SECRET_API_KEY`: the RevenueCat **secret** key (`sk_…`) of the same sandbox project as the public `rcb_sb_…` key. With it, the server re-reads the customer from RevenueCat REST and ignores what the client claims; without it, production refuses every purchase (see `docs/revenuecat.md`). Set it with `fly secrets set REVENUECAT_SECRET_API_KEY=sk_... -a mecena --stage`.
  - `MECENA_SIGNUP_CODE`: default invite code for sign-up (more codes, with caps and gifts: `npm run invite`, see above).
  - `MECENA_SIGNUP_OPEN`: `1` = open sign-up; invite codes become optional and still gift.
  - Optional: `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` (password gate), `MECENA_AI_DAILY_CAP` (global AI requests per day).
  - `fly secrets set ... --stage` stores a secret without restarting the machine; it takes effect on the next deploy.
- Health check: `fly.toml` checks `GET /api/health` (public, no data) every 15 s. `fly checks list -a mecena` shows its state.
- Backups: every write of `/data/db.json` first copies the previous version to `/data/db.json.bak`. If `db.json` is ever unreadable, the app serves the backup and the next write repairs `db.json`.
- Live calls catalogue: besides the curated `data/calls/calls.json`, the server searches BDNS in the background for each profile and refreshes a shared catalogue once a day, in process (`src/instrumentation.ts`, no cron to set up). It lives on the volume (`/data/calls/bdns-live.json`, public call data only). It needs `ANTHROPIC_API_KEY`; `MECENA_CALLS_LIVE=0` turns it off. Details in `data/calls/SOURCES.md`.
- Pro "Busca más para mí": one background Claude run with web search per profile (capped searches and tokens, cached a week, 3 runs per profile and 6 per user a month), stored per profile in `/data/deep-research.json` and shown as "Sin verificar".
- `NEXT_PUBLIC_REVENUECAT_*` and `NEXT_PUBLIC_PURCHASES_MOCK` are inlined at build time: pass them as `--build-arg`, not as secrets. The deploy workflow reads them from GitHub repo variables with the same names. Without the public key the paywall runs in mock mode, and simulated purchases are only granted outside production with `NEXT_PUBLIC_PURCHASES_MOCK=1`. `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID` is `mecena_pro`.

Besides `deploy.yml`, every pull request and every push to `main` run the `build` (`npm run build`), `test` (`npm test`), `lint` (`npm run typecheck`; there is no ESLint or Prettier config) and `security` (CodeQL, plus OpenSSF Scorecard on `main` and weekly) workflows. Dependabot proposes weekly updates for npm, GitHub Actions and the Docker base image.

## Día de demo

`main` deploys on every push, and a deploy restarts the only machine (in-memory state such as rate limits and running deep-research jobs is lost, and the app is down for ~30 s). So on demo day:

1. **Freeze `main` from 18:00.** No merges until the demos end (21:00). Last fixes go in before 18:00; after that, only a fix for something that breaks the demo, agreed by the team.
2. **Turn the auto-deploy off** to be safe: GitHub → Actions → "Deploy to Fly" → "···" → *Disable workflow* (or `gh workflow disable "Deploy to Fly"`). Turn it back on after the demos with *Enable workflow* (or `gh workflow enable "Deploy to Fly"`). Pull requests keep running their checks only while it is enabled.
3. Staged secrets (`fly secrets list -a mecena` shows them as *Staged*) take effect on the next deploy: deploy before 18:00 so the demo runs with them.
4. Before going on stage: `curl https://mecena.fly.dev/api/health` → `{"ok":true}`, sign in on the demo phone (sessions last 30 days, do not "Salir"), and check `fly status -a mecena` shows the machine `started` with its check passing.

The minute-by-minute stage script (Spanish) is in [`docs/demo-script.md`](docs/demo-script.md).

## Supported platforms and environments

| Area | Supported | Notes |
|---|---|---|
| Node.js | 22.12 or newer (`engines` in `package.json`) | CI (`ubuntu-latest`) and the Docker image (`node:22-bookworm-slim`) run Node 22. |
| Operating system for development | Linux (tested in CI) | macOS and Windows are not tested in CI. |
| Production | Fly.io, one machine, region `cdg`, 1 GB RAM, 1 GB volume at `/data` | Exactly one machine: `db.json` is written by a single process (`--ha=false`). |
| Phone browsers | Chrome on Android, Safari on iOS / iPadOS | The layout is mobile-first. Dictation needs HTTPS or `localhost`. On iOS Safari each dictation is single-shot and the app asks for a tap to keep listening. |
| Desktop browsers | Chrome and Safari for dictation; any current browser by typing | Firefox and some in-app browsers have no speech recognition: the interview falls back to typing. |
| MCP clients | Claude Code (Streamable HTTP), Claude Desktop (through `mcp-remote`, Node 18 or newer on that computer) | See [`docs/mcp.md`](docs/mcp.md). |

**What the tests cover.** `npm test` runs 117 Vitest files under `tests/` (Node environment, jsdom for the UI tests). Every test runs on AI mocks, the mock purchases adapter and a fresh temporary data directory with fictional fixture calls, so no key or network is needed. They cover accounts and isolation between users, invite codes and sign-in hardening, the voice hook (with a fake `SpeechRecognition`), onboarding, works and photo handling, the dossier and its PDF and free layout, call normalisation and matching, the BDNS ingest and sweep, drafting, the jury, justification, purchases and paywalls, the B2B panel, the demo scenarios, the MCP server (stdio and HTTP) and the platform pieces (store, AI limits, idempotency, proxy, routes). A few live tests call the real Claude API only when you opt in:

```sh
MECENA_LIVE_TESTS=1 ANTHROPIC_API_KEY=sk-ant-... npx vitest run tests/onboarding/live.test.ts
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The interview answers, the drafts or the jury look canned and identical every time | You are on AI mocks: `ANTHROPIC_API_KEY` is empty, `MECENA_AI_MOCK=1`, or the *IA simulada para esta cuenta* switch is on in `/demo`. Set the key in `.env.local`, restart `npm run dev`, and check the switch. On Fly, `fly secrets list -a mecena` must list `ANTHROPIC_API_KEY`. |
| "El código de invitación no es correcto." when creating an account | Sign-up requires a code because `MECENA_SIGNUP_CODE` is set or your database holds at least one invite code (an expired one counts). Type a valid code, list them with `npm run invite -- list`, delete local ones with `npm run invite -- delete <CODE>`, or set `MECENA_SIGNUP_OPEN=1`. "ha caducado" and "ya no tiene plazas" mean the code expired or is used up. |
| "La contraseña necesita al menos 8 caracteres" | Passwords need 8 to 200 characters. |
| You cannot sign in after several tries | 10 failed attempts per email from one IP every 15 minutes (100 per IP). Wait 15 minutes. |
| `npm install` prints an `EBADENGINE` warning for `mecena` | Your Node.js is older than 22.12 (`node -v`), the minimum in `engines`. Install Node 22.12 or newer (for example with `nvm install 22`), delete `node_modules` and run `npm install` again. |
| The microphone never starts on the phone | Dictation needs HTTPS or `localhost`: use the live app, or `npm run dev:phone` plus an HTTPS tunnel. Use Chrome or Safari, not an in-app preview; in Firefox, type your answers. Allow the microphone when the browser asks. On iOS, tap again when the app asks to keep listening. |
| The paywall says *Modo prueba*, or purchases are refused in production | Without `NEXT_PUBLIC_REVENUECAT_API_KEY` the paywall is a mock; simulated purchases are granted only outside production with `NEXT_PUBLIC_PURCHASES_MOCK=1`. In production, `REVENUECAT_SECRET_API_KEY` is required or every purchase is refused. `NEXT_PUBLIC_*` changes need a restart (dev) or a rebuild (deploy). See [`docs/revenuecat.md`](docs/revenuecat.md). |
| A 429 with "Mecena ha llegado hoy a su límite de uso de la IA. Vuelve a probar mañana." | The global daily ceiling `MECENA_AI_DAILY_CAP` is used up. Wait until the next day (Europe/Madrid), or raise the cap (`0` = no ceiling). |
| A 429 with "Has hecho muchas peticiones a la IA en poco tiempo. Espera unos minutos y vuelve a probar." | Your account hit a per-user AI limit (`src/server/ai-limits.ts`). Wait for the window to pass; the limits are kept in memory, so restarting the server also clears them. |
| `npm run calls:sweep` exits with "No hay clave de Anthropic" | A real sweep needs `ANTHROPIC_API_KEY`; use `--dry-run` to see what would enter without spending anything. |
| `npm run mcp` exits with `MECENA_USER_EMAIL is not set` | Set `MECENA_USER_EMAIL` to the email of an account created at `/entrar` against the same `MECENA_DATA_DIR`. More MCP fixes in the table at the end of [`docs/mcp.md`](docs/mcp.md). |
| The calls feed is empty | With "No hay convocatorias que coincidan con este filtro.", a search or quick filter is on: press *Ver todas las que encajan contigo*. With "Aún no encontramos convocatorias para tu perfil.", nothing matches yet: tell Mecena more in the interview (`/onboarding`). Calls whose edition already closed are listed apart, under *Próximas ediciones*. |
| The live app is down right after a merge | Every push to `main` redeploys and restarts the only machine (~30 s). Check `curl https://mecena.fly.dev/api/health` and `fly status -a mecena`. If `db.json` was unreadable, the app serves `db.json.bak` and the next write repairs it. |

## Support

- **Bugs and feature requests:** open an issue at https://github.com/lgarbayo/mecena/issues.
- **Questions:** open an issue too, or email the maintainers: Luis Garbayo <lugarbayo@gmail.com> and Vincenzo Gagliano <chenzouni@gmail.com>.
- **Security vulnerabilities:** do not open a public issue. Follow [`SECURITY.md`](SECURITY.md) and email both maintainers.

The maintainers answer within 24-48 hours. Mecena was built by a two-person team at a hackathon, so anything beyond that first answer is best effort.

## Contributing and project documents

Contributions are welcome. The flow is: create a feature branch from `main`, use [Conventional Commits](https://www.conventionalcommits.org/) (`feat(dossier): ...`, `fix(voice): ...`), run `npm run check`, and open a pull request to `main`. Every merge to `main` deploys to production, so keep pull requests small and green.

- [`CONTRIBUTING.md`](CONTRIBUTING.md): how to set up, branch, commit and open a pull request.
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md): how we treat each other.
- [`SECURITY.md`](SECURITY.md): how to report a vulnerability privately.
- [`CHANGELOG.md`](CHANGELOG.md): what changed in each version.
- [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md): why the project is built the way it is.
- [`docs/mcp.md`](docs/mcp.md), [`docs/revenuecat.md`](docs/revenuecat.md), [`docs/demo-script.md`](docs/demo-script.md), [`docs/design-system.md`](docs/design-system.md): topic guides.

## License

Mecena is released under the [MIT License](LICENSE). Copyright (c) 2026 Luis Garbayo.

The example artworks in `data/demo/works` are procedural images made by the team and released under CC0 1.0 (see [`data/demo/works/LICENSE.md`](data/demo/works/LICENSE.md)); the Inter font ships with its OFL license in `src/app/_fonts/Inter-OFL.txt`.
