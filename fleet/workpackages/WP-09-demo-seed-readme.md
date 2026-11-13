---
id: WP-09
title: Demo seed, reset panel, demo script doc and README with phone tunnel
deps: []
owns:
  - data/demo/**
  - public/demo/**
  - scripts/demo-reset.ts
  - src/app/demo/**
  - src/app/api/demo/**
  - src/features/demo/**
  - README.md
  - docs/demo-script.md
  - tests/demo/**
status: pending
hours: 2
criteria: [Live demo wow, Real problem and impact]
---

**Team blocks:** A9, A10 (Persona A); supports A11 and A13 (volunteer briefing + rehearsal checklist inside `docs/demo-script.md`). Launch in wave 2 so it can polish against merged features. **A9 never cut.**

## Goal
Anyone on the team can reset the demo in < 10 s (CLI or `/demo` on the phone), open the app on a phone over HTTPS, and follow a written ≤ 3-minute demo script with fallbacks.

## Consumes
- Store `initialDb`, `resetDb`, `rotateAppUserId`, `uploadsDir`, `exportsDir`; `Db` schema; fixtures; `DemoResetRequest/Response`; env `MECENA_SEED_FILE`.

## Provides
- `data/demo/seed.json` (valid `Db`), `data/demo/onboarded.json` (creator already onboarded: profile, transcript, 2-3 works, dossier sections), `public/demo/works/*` images, `resetDemo({ scenario })`, `POST /api/demo/reset`, `/demo` panel, `npm run demo:reset [-- --onboarded]`, `README.md`, `docs/demo-script.md`.

## Acceptance criteria
- [ ] `seed.json`: blank creator (active) + a credible Galician business profile (taller artesano / estudio de diseño) for the Pyme-mode beat; validates with `Db.parse` (`tests/demo/seed.test.ts`, which also validates `onboarded.json` and checks every `imageUrl` in it exists under `public/`).
- [ ] `resetDemo`: `blank` restores seed.json, `onboarded` restores onboarded.json; both delete runtime uploads/exports and rotate `appUserId` (fresh RevenueCat sandbox customer → paywall shows again). Runs in < 2 s. `tests/demo/reset.test.ts`.
- [ ] `/demo` (not linked from the nav): buttons "Reset en blanco", "Reset con artista ya dado de alta", shows current appUserId, AI mode (anthropic/mock) and purchases mode (revenuecat/mock), and quick links to every demo beat route.
- [ ] Demo work images in `public/demo/works/` are original, license-safe (made by the team or generated as abstract SVG/illustration placeholders, clearly ours), referenced by `onboarded.json`; the fixture paths `/demo/works/redeira-1.svg` and `/demo/works/marisqueo.svg` exist.
- [ ] `README.md` (Spanish + English short): what Mecena is, quickstart (`npm install`, `cp .env.example .env.local`, `npm run dev`), mock vs real keys, **phone over HTTPS**: `npm run dev:phone` + `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`), set `MECENA_PUBLIC_URL` to the tunnel URL, Chrome on Android/Safari iOS notes for the mic; MCP pointer to `docs/mcp.md`; RevenueCat pointer to `docs/revenuecat.md`; tests; demo reset.
- [ ] `docs/demo-script.md`: the beat-by-beat script from SPEC with exact taps and spoken lines, timings, what to say if each beat fails (fallback per beat), the volunteer artist briefing (what to say in 60 s, which 2-3 works to photograph) and a pre-demo checklist (battery, tunnel up, reset done, RevenueCat sandbox key, mic permission, projector mirroring, AI key quota).
- [ ] `npm test` + `npm run build` green.

## Notes
- Seed must not contain real people's personal data except the team's own, with consent.

## Contract change requests
