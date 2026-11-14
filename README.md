# mecena

Built for 1hack-2026.

## Live app

**https://mecena.fly.dev** (open it on your phone in Chrome or Safari: dictation needs a real browser, not an in-app preview).

**Accounts.** Everyone signs in at `/entrar` with an email and a password ("Crear cuenta" the first time). Each account has its own profiles (creator and pyme), transcripts, works and photos, dossiers and PDFs, applications, jury scores, usage and Mecena Pro / credits (its own RevenueCat app user id): nobody sees anyone else's data. Sessions are an httpOnly cookie (30 days); passwords are hashed with scrypt; the JSON store keeps only a hash of each session token. "Salir" in the header signs out.

**Invite codes.** Every AI call spends the owner's Anthropic key, so sign-up is invite-only in production: only people with a valid code can create an account (existing accounts keep signing in normally). Two kinds, usable together:
- `MECENA_SIGNUP_CODE` (Fly secret): one plain code, no cap, no gift; its accounts get the cohort `default`. Change it with `fly secrets set MECENA_SIGNUP_CODE=... -a mecena`.
- Codes in the database, managed with `npm run invite` (on Fly: `fly ssh console -C "sh -c 'cd /app && npx tsx scripts/invite.ts <command>'"`). Each one can cap how many accounts use it, expire, tag its accounts with a cohort (`signupCohort`, for attribution) and **gift Solicitud premium credits** to every new account:
  `npm run invite -- create 1HACK --label 1hack-2026 --uses 50 --credits 1 --expires 2026-12-31` · `npm run invite -- list` · `npm run invite -- delete 1HACK`.
  Codes are case-insensitive. The gift is kept apart from purchases (`grantedCredits`), so a RevenueCat sync never wipes it; a wrong, expired or used-up code gets its own message at sign-up.

Neither set = open sign-up. Invite codes survive `npm run demo:reset`.

**AI spending limits.** Every route that calls Claude has a per-user rate limit (`src/server/ai-limits.ts`: e.g. 90 onboarding turns per 15 min, 20 jury runs per hour, 600 AI requests per user per day) and answers 429 with a Spanish message past it. A real session or a rehearsal never gets near them. On top, a global ceiling of Claude requests per day for everyone together (`MECENA_AI_DAILY_CAP`, default 1500; `src/server/ai/budget.ts`, persisted in `/data/ai-usage.json`). Request bodies are capped too (1 MB by default; texts at 4,000 characters, agent history at 20 turns).

**Sign-in limits.** 10 failed attempts per email from one IP every 15 minutes, and 100 per IP (a venue's Wi-Fi puts everyone behind one address). Successful logins and sign-ups do not count.

**Password gate (optional).** `fly secrets set BASIC_AUTH_USER=... BASIC_AUTH_PASSWORD=...` puts an HTTP Basic password in front of the whole site, before the account login (`src/proxy.ts` turns it on only when the password is set).

`/demo` → "Empezar de cero" resets only the signed-in account's data (and gives it a fresh RevenueCat id so the paywall shows again). `npm run demo:reset` on the machine is the admin reset: it wipes the whole database, every account included. A `db.json` from the single-user days still loads: its old profiles simply belong to nobody.

### Deploy

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
  - Optional: `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` (password gate), `MECENA_AI_DAILY_CAP` (global AI requests per day).
  - `fly secrets set ... --stage` stores a secret without restarting the machine; it takes effect on the next deploy.
- Health check: `fly.toml` checks `GET /api/health` (public, no data) every 15 s. `fly checks list -a mecena` shows its state.
- Backups: every write of `/data/db.json` first copies the previous version to `/data/db.json.bak`. If `db.json` is ever unreadable, the app serves the backup and the next write repairs `db.json`.
- Live calls catalogue: besides the curated `data/calls/calls.json`, the server searches BDNS in the background for each profile and refreshes a shared catalogue once a day, in process (`src/instrumentation.ts`, no cron to set up). It lives on the volume (`/data/calls/bdns-live.json`, public call data only). It needs `ANTHROPIC_API_KEY`; `MECENA_CALLS_LIVE=0` turns it off. Details in `data/calls/SOURCES.md`.
- Pro "Busca más para mí": one background Claude run with web search per profile (capped searches and tokens, cached a week, 3 runs per profile and 6 per user a month), stored per profile in `/data/deep-research.json` and shown as "Sin verificar".
- `NEXT_PUBLIC_REVENUECAT_*` and `NEXT_PUBLIC_PURCHASES_MOCK` are inlined at build time: pass them as `--build-arg`, not as secrets. The deploy workflow reads them from GitHub repo variables with the same names. Without the public key the paywall runs in mock mode, and simulated purchases are only granted outside production with `NEXT_PUBLIC_PURCHASES_MOCK=1`. `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID` is `mecena_pro`.

## Día de demo

`main` deploys on every push, and a deploy restarts the only machine (in-memory state such as rate limits and running deep-research jobs is lost, and the app is down for ~30 s). So on demo day:

1. **Freeze `main` from 18:00.** No merges until the demos end (21:00). Last fixes go in before 18:00; after that, only a fix for something that breaks the demo, agreed by the team.
2. **Turn the auto-deploy off** to be safe: GitHub → Actions → "Deploy to Fly" → "···" → *Disable workflow* (or `gh workflow disable "Deploy to Fly"`). Turn it back on after the demos with *Enable workflow* (or `gh workflow enable "Deploy to Fly"`). Pull requests keep running their checks only while it is enabled.
3. Staged secrets (`fly secrets list -a mecena` shows them as *Staged*) take effect on the next deploy: deploy before 18:00 so the demo runs with them.
4. Before going on stage: `curl https://mecena.fly.dev/api/health` → `{"ok":true}`, sign in on the demo phone (sessions last 30 days, do not "Salir"), and check `fly status -a mecena` shows the machine `started` with its check passing.

## Local

```sh
npm install
npm run dev          # http://localhost:3000
npm run check        # typecheck + tests
```
