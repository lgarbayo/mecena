# Security Policy

Mecena is a web app that helps artists and small businesses find public grant calls and prepare their applications. It holds personal data (profiles, interview answers, photos of works, invoices) and spends a paid AI key on its users' behalf, so we take security reports seriously, even though it is a small project.

Please read this page before reporting. It explains what we support, how to reach us privately, how fast we answer, what we already know is weak, and how we handle disclosure.

## 1. Supported versions

Mecena has no numbered releases. There is one line of development, the `main` branch, and every push to `main` is deployed automatically to the live app at <https://mecena.fly.dev> by `.github/workflows/deploy.yml`.

| Version | Supported |
|---------|-----------|
| `main` branch (latest commit) | Yes |
| The live deployment at <https://mecena.fly.dev> (always built from `main`) | Yes |
| Older commits, other branches, forks and self-hosted copies that have not pulled the latest `main` | No |

If you run your own copy, update to the latest `main` before reporting; the issue may already be fixed.

## 2. Reporting a vulnerability

**Do not open a public GitHub issue, pull request or discussion for a security problem.** Public reports put every Mecena user at risk before a fix exists.

Send an email to **both** maintainers at the same time:

- Luis Garbayo: <lugarbayo@gmail.com>
- Vincenzo Gagliano: <chenzouni@gmail.com>

Write "Security" at the start of the subject line so it does not get lost among other mail. GitHub's private vulnerability reporting (the "Report a vulnerability" button in the Security tab) is not enabled on this repository at the moment, so email is the only private channel. If we turn it on later, we will update this page.

### What to include

The more of this you can give us, the faster we can confirm and fix the issue:

- **What is affected**: the page, API route (for example `POST /api/works`) or file in the repository (for example `src/server/auth/users.ts`).
- **What an attacker can do**: read another account's data, act as another user, use AI without limits, get Pro without paying, and so on.
- **Steps to reproduce**: exact requests or clicks, with the accounts involved. Use test accounts you created yourself.
- **Where you found it**: the live app or a local copy, and the commit hash if it was local (`git rev-parse HEAD`).
- **Proof**: a short script, `curl` commands or screenshots. Remove any real personal data you came across.
- **How you want to be credited**, or whether you prefer to stay anonymous.

### Example report

> **Subject:** Security: work photos readable by other accounts
>
> **Affected:** `GET /api/works/{id}/image`, commit `46dfa4f`, tested on a local copy.
>
> **Impact:** a signed-in user can download the photo of a work that belongs to a different account if they know its id.
>
> **Steps:**
> 1. Create account A, upload a work, note its id from the network tab.
> 2. Sign out, create account B.
> 3. As B, run `curl -b "mecena_session=<B's cookie>" http://localhost:3000/api/works/<A's work id>/image`.
> 4. The response is A's photo instead of a 404.
>
> **Credit:** please credit me as "Jane Doe".

(That route checks ownership today; the example only shows the level of detail that helps us.)

### How to test without hurting anyone

- **Prefer a local copy.** Clone the repository, run `npm install`, `cp .env.example .env.local` and `npm run dev` (see the Quickstart in the [README](README.md)). With `ANTHROPIC_API_KEY` left empty, every AI call runs on deterministic mocks, so you can test freely and nothing is spent.
- On the live app, only use accounts you created yourself. To show a cross-account problem, use two of your own accounts; never open, change or keep other people's data beyond the minimum needed to prove the issue.
- Do not run load tests, fuzzers or high-volume scanners against <https://mecena.fly.dev>. It is a single small machine and every AI request is paid for by the project owner.

### Scope

**In scope**

- The code in this repository: the Next.js app and its API routes under `src/app/api/`, the server code under `src/server/` and `src/features/`, the MCP server in `src/mcp/` (both the remote endpoint at `/api/mcp` and the local stdio server started with `npm run mcp`), and the scripts under `scripts/`.
- The live deployment at <https://mecena.fly.dev>.
- The build and deploy configuration: `Dockerfile`, `fly.toml` and the workflows in `.github/workflows/`.

**Out of scope** (please report these to their owners instead)

- Vulnerabilities in the third-party services Mecena uses: the Anthropic API, RevenueCat, Fly.io, GitHub, and the public BDNS grant database at infosubvenciones.es.
- Vulnerabilities in upstream npm packages (Next.js, React, the MCP SDK, and so on). Report them to the package. If Mecena uses a package in a way that makes it exploitable, that part is in scope.
- The speech recognition built into your browser: dictation (in the interview and other voice steps) uses the browser's own speech recognition, which Mecena does not control.
- Denial of service through sheer volume, spam, social engineering of the maintainers, and attacks that need physical access to a device or an already compromised browser.
- The known limitations listed in section 4, unless you can show a concrete way to exploit them that goes beyond what is described there.

## 3. Response timelines

Mecena is maintained by two people who built it at a hackathon. We commit to the following:

| Step | When |
|------|------|
| We acknowledge your report and tell you who is handling it | Within 24 to 48 hours |
| We confirm whether we can reproduce it and how serious we think it is | Best effort |
| We fix it on `main` (which deploys the fix to the live app) | Best effort, depending on severity and on our availability |
| We tell you the fix is live and agree on when details can be published | As soon as the fix is deployed |

Beyond the first answer, everything is best effort: we have no dedicated security team and no on-call rota. If you have not heard from us within 48 hours, please send the email again in case it went to spam.

## 4. Known limitations

Mecena was built on 13 and 14 November 2026 at the 1hack-2026 hackathon. **It has never had an external security audit or penetration test.** What follows is what we know about its design, written so you can judge what is worth reporting.

**Accounts and sessions**

- Sign-in is email and password only. Passwords are hashed with scrypt and the session cookie is an opaque random token (`HttpOnly`, `SameSite=Lax`, `Secure` in production) that lasts 30 days; the server stores only a hash of it.
- There is no email verification, no password reset flow and no two-factor authentication. Signing out ends the session on the server, and deleting the account (from the `/confianza` page) removes the account and the data it owns.
- Sign-in and sign-up attempts are rate limited per email (from each IP address) and per IP address. These counters live in memory, so they reset whenever the server restarts, which includes every deploy.

**Data storage**

- All application data lives in one JSON file (`db.json`) on a single Fly.io volume attached to a single machine, together with uploaded files and PDF exports. This is deliberate, but it means there is no replication.
- Each write keeps one previous copy (`db.json.bak`) on the same volume. There are no off-site backups.
- Separation between accounts is enforced in the API route handlers and in `src/server/auth`, which check that the signed-in user owns the profile, work, application or invoice being requested. The storage layer itself does not check ownership, so a route that forgot that check would be a real vulnerability and is exactly the kind of report we want.

**AI usage and cost controls**

- Every AI feature runs on the project owner's server-side Anthropic API key. Users never provide their own key.
- Spending is bounded by three layers: a per-user limit on each AI route, a per-user daily allowance across all AI routes, and a global daily ceiling on Claude requests for the whole app (`MECENA_AI_DAILY_CAP`). The per-user limits live in memory, like the sign-in counters, so a restart resets them; the global ceiling is saved on the data volume and survives restarts. A way to get around these limits is in scope.
- Text, photos and documents that users provide, and the text of public grant calls, are sent to the Anthropic API as part of prompts. Structured model answers are validated against fixed schemas before they are used, but there is no other specific defence against prompt injection.

**Sign-up and invite codes**

- Sign-up requires an invite code whenever one exists (`MECENA_SIGNUP_CODE`, or codes created with `npm run invite`), unless it is opened with `MECENA_SIGNUP_OPEN=1`; with no code at all, sign-up is open. Invite codes exist to control who can spend the AI budget; they are not meant as a strong security boundary.

**Purchases (RevenueCat)**

- Purchased Pro and premium credits are granted only after the server checks the purchase with RevenueCat using a secret key (credits gifted by an invite code are granted by the server itself, at sign-up). Purchase claims coming from the browser are never trusted on their own, and in production the server refuses them when that key is missing.
- Simulated purchases ("Modo prueba") are granted only outside production. When the RevenueCat secret key is set, only the stage accounts listed in `DEMO_EMAILS` can load the demo Pro scenario from `/demo`; a deployment without RevenueCat keys lets any signed-in account load it.

**Uploads**

- Photos of works and invoices are accepted only as JPEG, PNG or WebP, with size limits, and are served only to their owner. Imported dossiers (PDF or photo) are stored as uploaded. Files are not scanned for malware.

**MCP server**

- The remote MCP endpoint (`/api/mcp`) authenticates with personal access tokens created and revoked at `/cuenta`. Only a hash of each token is stored, each account can have at most 10, and tool calls are rate limited. Tokens do not expire and have no narrower scopes: a token can do everything the MCP tools can do for that account, so it should be treated like a password.
- The local MCP server (`npm run mcp`) acts as the account named in `MECENA_USER_EMAIL` with direct access to the local data directory. It is meant to run on a machine you control, for your own account.

**Hardening and supply chain**

- No Content Security Policy or other custom security headers are configured yet. An optional site-wide HTTP Basic auth gate (`BASIC_AUTH_PASSWORD`) exists for private demos.
- Dependencies are not reviewed by hand. Dependabot proposes updates every week, and CodeQL and OpenSSF Scorecard run in `.github/workflows/security.yml`.

## 5. Disclosure policy

We follow coordinated disclosure:

1. You report privately by email, as described above.
2. We acknowledge within 24 to 48 hours and work on a fix, keeping you informed.
3. Once the fix is deployed to <https://mecena.fly.dev>, we agree with you on a date to publish the details. If no fix is possible, we agree on a reasonable period together before anything is published.
4. We credit you in the fix commit and the changelog, unless you ask to stay anonymous.

Please do not publish details, proof-of-concept code or data you obtained until the fix is live or the agreed period has passed. We will not take any action against people who report in good faith and follow this policy.
