# Changelog

All notable changes to Mecena are recorded here, newest first. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and version numbers follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), starting from the `0.1.0` in
`package.json`.

## How to keep this file up to date

Every significant change adds an entry under **[Unreleased]** in the same pull request that makes
the change. That covers new features, changes in behaviour, bug fixes a user or operator would
notice, security fixes, removed features, new or renamed environment variables, and significant
documentation improvements (a new guide, or setup or deploy steps that changed). Pure refactors,
test-only changes and typo fixes do not need an entry.

- **Explain why, not only what.** Do not just list the files you touched. Say what was wrong or
  missing and what the change means for the people using or running Mecena.
- **Pick the right heading:** `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` or `Security`.
- **Link the pull request** with its number, for example `(#71)`.
- **Group related work** into one entry instead of one line per commit.
- **This applies to AI coding agents too.** `AGENTS.md` tells them to update this file for every
  significant change, and reviewers should ask for it when it is missing.

A good entry reads like this:

> - "Empezar de cero" now wipes the old profile and dossier as soon as you enter the interview,
>   instead of waiting for the first answer (which left the old data on screen and lost the reset
>   if that answer had to be retried). (#71)

**Cutting a release:** rename `[Unreleased]` to the new version and today's date (for example
`## [0.2.0] - 2026-12-01`), bump `version` in `package.json`, tag the merge commit (`v0.2.0`),
open a new empty `[Unreleased]` section and update the links at the bottom of the file.

The app's interface is in Spanish, so entries quote screen labels as the user sees them
(for example «Convocatorias» or «Prefiero escribir»).

## [Unreleased]

### Added

- Community health files, so that people outside the hackathon team know how to use, report
  problems with and contribute to Mecena: a `CONTRIBUTING.md` (local setup, the feature branch →
  pull request → `main` flow, and the 24–48 hour first answer the two maintainers commit to), a
  `SECURITY.md` (report vulnerabilities privately by email to both maintainers, never in a public
  issue), a `CODE_OF_CONDUCT.md`, and issue and pull request templates under `.github/`. The
  new open-source sections were merged into the existing README, which keeps its deploy and
  demo-day notes.
- This changelog, rebuilt from the git history and the merged pull requests of the hackathon, so
  the story of the project can be read without going through almost 300 commits.
- `docs/ARCHITECTURE_DECISIONS.md`, which records the main technical decisions taken at the
  hackathon and the reasons behind them, so new contributors do not undo them by accident.
- Separate `build`, `test`, `lint` and `security` GitHub Actions workflows. `deploy.yml` already
  ran `npm run check` before every deploy, but as a single job; now each check reports its own
  status, so a red pull request says exactly what broke. `lint` runs the TypeScript compiler
  (`npm run typecheck`) because the project has no ESLint or Prettier config yet, and `security`
  runs CodeQL on every pull request plus OpenSSF Scorecard on `main` and once a week. The build
  runs on AI mocks, so CI never needs an Anthropic key.
- Dependabot, checking npm packages, GitHub Actions and the Docker base image every week. Minor
  and patch npm updates arrive grouped in one pull request, so security fixes reach us without
  flooding the pull request list.
- A "Project conventions" section in `AGENTS.md`, so AI coding agents also update this changelog,
  write Conventional Commits and run `npm run check` before calling a change finished.

### Changed

- Conventional Commits are now the documented commit convention (see `CONTRIBUTING.md`). Most of
  the hackathon history already used them (`feat(onboarding): …`, `fix(voice): …`); writing the
  rule down makes it the same for every new contributor and keeps the history easy to scan.

## [0.1.0] - 2026-11-14

The first version, built on 13 and 14 November 2026 at the 1hack-2026 hackathon and deployed at
<https://mecena.fly.dev>. Mecena helps artists in Spain, and in a second mode small businesses
and the self-employed, go from talking about their work to an editorial dossier, a ranked list of
real public calls for grants and prizes, and a draft application checked by a simulated jury.

### Added

- **A shared foundation for parallel work.** Typed contracts for profiles, calls, works and
  applications, a JSON file store, AI and purchase interfaces with deterministic mocks, and the
  app shell came first, together with the idea brief, the spec, the work packages, the data
  pipeline design and the team split in `fleet/` (#1, #2). Two people were building eleven work
  packages at once, so everything had to be written against one binding contract; the mocks let
  every screen and every test work without an Anthropic key. The pitch materials in
  `fleet/pitch/` position Mecena for artists first, with businesses as a second path, and close
  only on what already works, with no invented traction figures (#10, #49).
- **Voice onboarding.** The artist answers a few questions by speaking or typing, and Claude turns
  each answer into profile data while a live dossier grows next to the voice orb (#6, #19, #40).
  Artists explain their work far better out loud than in a form, so this is the heart of the app.
  Answers are sent strictly in order and a failed one can be retried, so nothing said is lost;
  turns run on a fast model (`MECENA_MODEL_ONBOARDING`) to keep the conversation flowing; and
  «Prefiero escribir» is always there, switching to text on its own if the microphone is denied.
  The words now visibly fly from the transcript into the dossier (#58). The approach was measured
  first in a voice spike, which picked the faster model for extraction on latency (#13).
- **Import an existing dossier.** Artists who already have one upload it as a PDF, a photo or
  pasted text, and Mecena copies their own words in and only asks for what is missing, instead of
  making them start again by voice (#17).
- **Works with technical sheets.** Photograph a work, add a voice or text note while the photo
  uploads, and Claude's vision drafts the sheet (title, year, technique, series) for the artist to
  confirm. Mecena never generates or alters the work and never guesses its size from the image;
  crops are visual and the original is kept (#4).
- **Editorial dossier and PDF** for creators and businesses, with the fonts hosted in the project
  so the demo does not depend on Google Fonts (#5). Pro users get a version adapted to a specific
  call, restructured the way the call's rules ask, with gaps marked `[PENDIENTE: …]` instead of
  invented and unbacked numbers flagged (#16). Look requests made during the interview, such as
  «fondo negro», reach the design (#35).
- **Free dossier layout.** Instead of filling a template, the model composes each page from the
  works, the discipline and what the artist said, and offers several clearly different proposals
  (`MECENA_LAYOUT_COUNT`), with the template kept as a fallback (#50). Templates made every
  dossier look alike. The interview now asks «¿Cómo te imaginas tu dossier?» and the first
  proposals start on their own (#66), and the layout follows the texts when they change (#59).
- **A data standard for matching.** Shared vocabularies for disciplines, territories,
  beneficiary types, CNAE codes, document types and holidays (`data/taxonomy/`), plus canonical
  territory and beneficiary ids on both profiles and calls (#8, #14). Without them matching failed
  silently on things like "pintura" against "artes plásticas" or "Coruña (A)" against a NUTS code.
- **A catalogue of real calls.** Calls read one by one from their official rules (25 at first,
  37 in `data/calls/calls.json` today), a BDNS ingest script, and a call history built from past
  editions' awards and official resolutions. The history shows a success rate only when a
  resolution gives the number of applicants, never an invented probability (#11, #12). A
  national BDNS sweep for creators (`npm run calls:sweep`) finds more: BDNS lists thousands of
  culture records, most of them agreements, direct grants or local festivities, so cheap filters
  on the title, the BDNS detail and the beneficiaries run before any call reaches Claude (#54).
- **Matching and the calls feed.** Code decides eligibility and the score; Claude only explains
  them, so results are reproducible and auditable. Missing profile data becomes «Confírmalo: …»
  instead of a silent discard, and the free plan shows a limited number of matches a month (#9).
  The feed is now ranked by how well each call fits that profile, Mecena searches BDNS in the
  background for each profile and refreshes a shared catalogue daily, and Pro adds «Busca más
  para mí», a web search whose results are labelled «Sin verificar» (#33).
- **Draft application and simulated jury.** The draft is written from the user's own words and
  leaves `[Completa: …]` gaps instead of inventing, and a jury of three personas matched to the
  applicant scores it against the call's criteria and suggests improvements (#15).
- **Payments with RevenueCat Web Billing.** Pro plans and a one-off «Solicitud premium» are sold
  through a checkout embedded in the page, so the user never leaves the app, with a mock mode for
  local development (#20).
- **Mecena inside Claude.** One set of tools powers both an MCP server and the in-app agent
  «Pregúntale a Mecena», so a purchase on the phone also unlocks the tools in Claude Desktop (#3).
  The MCP server is also reachable remotely at `/api/mcp` with personal tokens, and the tools
  respect the same paywall as the app (#37, see `docs/mcp.md`).
- **Accounts.** Email and password sign-in at `/entrar`, with each account owning its own
  profiles, works, dossiers, applications and purchases (#32). Before this, everyone who opened
  the public URL shared a single profile, and two testers saw each other's data.
- **Invite codes** with a usage cap, an expiry date, a cohort for attribution and gifted premium
  credits, managed with `npm run invite` (#63). A leaked code runs out instead of draining the AI
  budget, and invited people can try the paid core without a card. `MECENA_SIGNUP_OPEN=1` opens
  sign-up while codes keep their gifts (#65).
- **Grant justification.** Photograph an invoice, Mecena reads it, assigns it to a line of the
  application's budget, warns when a line or the total goes over, and writes the final
  justification report. Getting the grant is only half the work (#53).
- **A panel for schools and associations** at `/panel` that follow several creators. Nothing is
  shared until the creator accepts and picks which of their profiles to show, and the
  organisation only sees name, discipline, place and matched calls, never dossiers or drafts (#52).
- **Request idempotency.** Every write sends an `Idempotency-Key`; the server replays a successful
  answer for 24 hours and refuses a different body under the same key. On a phone with flaky
  venue Wi-Fi, a double tap or a retry must not spend AI twice or create two applications (#68).
- **Account deletion and a health check.** «Borrar mi cuenta» removes the account's data and
  photos, and the public `GET /api/health`, checked by Fly every 15 seconds, shows at a glance
  whether the live app is answering (#38).
- **Demo tooling.** Ready-made scenarios at `/demo` (example artist, Pro artist with an
  application, example business), plan-B switches for a deterministic jury or simulated AI,
  `npm run demo:preflight` to check the deployed app without spending AI, and a timed demo script
  in `docs/demo-script.md` (#39, #55).
- **Deployment on Fly.io** at <https://mecena.fly.dev>: one machine with a persistent volume, so
  the database, photos and PDFs survive restarts (#21). HTTPS was needed for dictation on phones.
  Every push to `main` deploys automatically after `npm run check`, so nobody needs a Fly account
  to ship (#26).
- **Brand and first screen.** The Mecena logo (a sheet with a cut corner whose bottom edge is an
  «m») and a first screen, `/empezar`, where people choose «Creador/a» or «Pyme o autónomo/a»
  before signing in, so the whole app starts in the right mode (#74).

### Changed

- **Visual design.** The home screen and the onboarding got a glass-effect look (#19), which a
  direct commit on `main` then extended to every screen as a dark, glass-effect, mobile-first
  design. The app later moved to a light design system with skeleton loaders shaped like the content they replace (#68, see
  `docs/design-system.md`). The dossier and its PDF keep their own editorial design.
- **Built for the phone.** The onboarding fits one phone screen with no phantom scroll (#51), and
  a mobile-only pass below 640 px fits the header at 320 px with 44 px tap targets, keeps only
  the main action in the sticky bars and uses 16 px inputs so iOS does not zoom on focus, without touching tablet or desktop (#73).
- **Honest, faster draft and jury.** Criteria the jury had to estimate are labelled as such,
  improvements only use facts the user supplies, the jury warms up while the draft opens and shows
  each score as it arrives, and improvements can be undone (#41).
- **Prices follow RevenueCat.** The paywall reads the live prices instead of hardcoded copy and
  shows «Mejor precio» only when the annual plan really is cheaper (#23). The offline fallback,
  pitch and demo script now match the live 3,99 €/mes and 35,88 €/año (#45, #57).
- **Fairer ranking.** Closed past editions go to their own «Próximas ediciones» section and never
  use a free slot, calls from other disciplines leave the feed once the profile says what it
  does, and "nationwide" is only claimed when the call really is (#43).

### Removed

- The Creador/a · Pyme switch in the header. Since #74 the mode is chosen on the first screen,
  before the account exists, so the switch repeated that choice on every page (#75).
- The promise of alerts "before calls close". It was not implemented; Pro users now get a real
  in-app «Cierra en N días» notice for matches with a published deadline in the next seven days
  (#36).

### Fixed

- Business onboarding never reached Claude: its turn schema was rejected as too complex, so every
  business silently got the simple fallback extractor, and dossier import failed the same way
  (#27).
- Dictation on real phones. Spoken onboarding stopped after the first answer, iPhone Safari and
  Chrome dropped the microphone between questions, and switching between voice and text lost what
  had just been said. Each question now opens a fresh dictation session from the user's tap, and
  `?voz=debug` shows the browser's speech events on screen for diagnosis (#30, #64, #70, #72).
- «Empezar de cero» did not start over until the first answer was sent, and a wrong value from
  the interview could not be corrected. The reset now happens at once, and each profile field can
  be edited by hand (#71).
- The fallback extractor stored "Vivo en Vigo, Pontevedra" as the city Pontevedra, which also
  gave matching the wrong municipality; the first place named now wins (#60).
- Opening «Convocatorias» before finishing the profile spent the month's free matches on an empty
  profile; the free plan now shows an unsaved preview until the profile is complete. Two other
  fixes from the same review stop the onboarding from wiping the profile and the paywall checkout
  from being squeezed (#44). Locked cards on the free plan now show their score, and the
  business onboarding no longer shows creator-only options (#69).
- Scores that read as sure things while requirements were still open. A call with several
  unconfirmed requirements can no longer be rated «alto», residence abroad is recognised, local
  calls from another region rank below your own, and missing rules such as minimum turnover were
  added (#47, #56).
- Works, dossier and PDF: crops and rotation now reach the dossier and the PDF, each work makes a
  single vision call, internal notes and unreviewed sheets stay out of the PDF, and the business
  capabilities report is reachable (#42).
- Free layout quality: a one-page proposal with only a cover could be shown as a dossier, a work
  could appear twice or with its caption over a full-bleed photo, and the «Ajustar la maquetación
  a mis textos» button showed up even when nothing needed fixing (#61, #62, #67).
- The whole app rendered in Times because the global styles pointed at font variables that did
  not exist, the calls panel had no styles, and the «Encaje alto» filter hid cards marked «ALTO»
  (#46).
- Pro would never have unlocked once server verification was on, because the code checked a hardcoded
  entitlement id instead of the dashboard's `mecena_pro`; it is now read from
  `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID` (#24).
- Voice spike (`fleet/spikes/voice`): misspelled keys from the model are corrected instead of
  dropping the answer, corrupted questions are discarded, corrections no longer leak into the
  dossier text, and the final dossier pass runs one call per section in parallel (#25, #28, #29,
  #31).

### Security

- **Each user sees only their own data.** The server takes the user from the session on every API
  route, agent tool, photo and PDF download, and ignores any identity the client sends; someone
  else's resource answers 404. Passwords are hashed with scrypt, the session cookie is httpOnly
  and only a hash of its token is stored, `?next` redirects cannot leave the site, and JSON routes
  refuse cross-site requests (#32). Invite codes are compared in constant time, and personal MCP
  tokens are stored only as a hash and can be revoked from «Cuenta» (#37, #63).
- **Nobody becomes Pro for free.** Purchases are verified with RevenueCat's REST API using
  `REVENUECAT_SECRET_API_KEY` instead of trusting what the browser claims; without that key,
  production refuses every purchase. Pro expires on time, premium credits are reserved atomically
  before the AI runs, and a double tap spends a single credit (#20, #36).
- **Limits on AI spending.** Every AI call runs on the owner's Anthropic key, so each route that
  calls Claude has a per-user rate limit, there is a global daily ceiling (`MECENA_AI_DAILY_CAP`),
  request bodies and texts are capped, sign-in attempts are limited per email and IP, and error
  messages no longer expose internal details (#38).
- **Optional password gate.** Setting `BASIC_AUTH_PASSWORD` puts HTTP Basic authentication in front
  of the whole site; it is off on the live app so phones can open it directly (#21, #22).

[Unreleased]: https://github.com/lgarbayo/mecena/commits/main
[0.1.0]: https://github.com/lgarbayo/mecena/tree/e42361790e9d7aad2d4b5e77001c7c2951379f66
