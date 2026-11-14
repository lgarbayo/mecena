# mecena

Built for 1hack-2026.

## Live app

**https://mecena.fly.dev** (open it on your phone in Chrome or Safari: dictation needs a real browser, not an in-app preview).

Open, no login. The app is single-user: everyone who opens the link shares the same profile, and every AI call spends the owner's Anthropic key. To put a password back: `fly secrets set BASIC_AUTH_USER=... BASIC_AUTH_PASSWORD=...` (`src/proxy.ts` turns it on only when the password is set).

### Deploy

Fly.io, one machine with a persistent volume (`mecena_data` mounted at `/data`, `MECENA_DATA_DIR=/data`), configured in `fly.toml` and `Dockerfile`.

Every push to `main` deploys automatically: `.github/workflows/deploy.yml` runs `npm run check` and then `flyctl deploy`, using the repo secret `FLY_API_TOKEN` (a deploy token scoped to the app). Nobody needs a Fly account to ship: merge to `main`. You can also re-run it by hand from the Actions tab ("Deploy to Fly" > Run workflow).

Deploying by hand still works if you have access to the Fly app:

```sh
fly deploy --ha=false --remote-only   # --ha=false: db.json needs exactly one machine
```

The token expires in a year (Nov 2027). To renew it: `fly tokens create deploy -a mecena -x 8760h | gh secret set FLY_API_TOKEN`.

- Secrets (runtime): `ANTHROPIC_API_KEY` and, optionally, `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` (`fly secrets set ...`). Without the Anthropic key the app silently falls back to AI mocks.
- `NEXT_PUBLIC_REVENUECAT_*` and `NEXT_PUBLIC_PURCHASES_MOCK` are inlined at build time: pass them as `--build-arg`, not as secrets. The deploy workflow reads them from GitHub repo variables with the same names. Without the public key the paywall runs in mock mode.

## Local

```sh
npm install
npm run dev          # http://localhost:3000
npm run check        # typecheck + tests
```
