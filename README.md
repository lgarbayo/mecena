# mecena

Built for 1hack-2026.

## Live app

**https://mecena.fly.dev** (open it on your phone in Chrome or Safari: dictation needs a real browser, not an in-app preview).

**Accounts.** Everyone signs in at `/entrar` with an email and a password ("Crear cuenta" the first time). Each account has its own profiles (creator and pyme), transcripts, works and photos, dossiers and PDFs, applications, jury scores, usage and Mecena Pro / credits (its own RevenueCat app user id): nobody sees anyone else's data. Sessions are an httpOnly cookie (30 days); passwords are hashed with scrypt; the JSON store keeps only a hash of each session token. "Salir" in the header signs out.

**Invite code (optional).** Every AI call spends the owner's Anthropic key, so sign-up can be invite-only: `fly secrets set MECENA_SIGNUP_CODE=...` and only people with the code can create an account (existing accounts keep signing in normally). Unset = open sign-up.

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

- Secrets (runtime): `ANTHROPIC_API_KEY` and, optionally, `MECENA_SIGNUP_CODE` (invite-only sign-up) and `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` (`fly secrets set ...`). Without the Anthropic key the app silently falls back to AI mocks.
- Live calls catalogue: besides the curated `data/calls/calls.json`, the server searches BDNS in the background for each profile and refreshes a shared catalogue once a day, in process (`src/instrumentation.ts`, no cron to set up). It lives on the volume (`/data/calls/bdns-live.json`, public call data only). It needs `ANTHROPIC_API_KEY`; `MECENA_CALLS_LIVE=0` turns it off. Details in `data/calls/SOURCES.md`.
- Pro "Busca más para mí": one background Claude run with web search per profile (capped searches and tokens, cached a week, 3 runs per profile and 6 per user a month), stored per profile in `/data/deep-research.json` and shown as "Sin verificar".
- `NEXT_PUBLIC_REVENUECAT_*` and `NEXT_PUBLIC_PURCHASES_MOCK` are inlined at build time: pass them as `--build-arg`, not as secrets. The deploy workflow reads them from GitHub repo variables with the same names. Without the public key the paywall runs in mock mode.

## Local

```sh
npm install
npm run dev          # http://localhost:3000
npm run check        # typecheck + tests
```
