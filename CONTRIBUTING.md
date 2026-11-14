# Contributing to Mecena

Thank you so much for taking the time to read this. It genuinely means a lot. Mecena is a small project born at 1hack-2026, and the fact that you are here considering contributing to it is something we do not take for granted.

Mecena helps visual artists and small businesses (*pymes*) in Spain find public calls for grants and aid, build a dossier, draft an application and rehearse it in front of a simulated jury. It is a Next.js app, live at <https://mecena.fly.dev>. Bug reports, fixes, ideas, documentation and tests are all welcome.

## How long will it take?

Mecena is maintained by two people:

- Luis Garbayo <lugarbayo@gmail.com>
- Vincenzo Gagliano <chenzouni@gmail.com>

We answer every new issue and pull request **within 24 to 48 hours**. That first answer may be a review, a question or a "thanks, we'll look at it this week". Beyond that first answer, getting a contribution reviewed in full and merged is **best effort**: we are a two-person hackathon team, so a large change may take several rounds and a few days. If you have heard nothing after 48 hours, a friendly ping on the issue or PR is welcome.

## Contents

- [Ways to contribute](#ways-to-contribute)
- [Setting up your environment](#setting-up-your-environment)
- [Making a change, step by step](#making-a-change-step-by-step)
- [Coding standards](#coding-standards)
- [Tests](#tests)
- [Commit messages: Conventional Commits](#commit-messages-conventional-commits)
- [Keeping CHANGELOG.md up to date](#keeping-changelogmd-up-to-date)
- [Pull requests and review](#pull-requests-and-review)
- [Definition of done](#definition-of-done)

## Ways to contribute

- **Report a bug**: open an issue with the "Bug report" template. Tell us the page (for example `/convocatorias` or `/dossier`), the device and browser, and whether you were signed in as a creator or a pyme.
- **Suggest a feature**: open an issue with the "Feature request" template and describe the problem before the solution.
- **Ask a question**: use the "Question" template.
- **Send code or docs**: follow the steps below. For anything bigger than a small fix, open an issue first so we can agree on the approach before you spend time on it.
- **Security problems are never reported in a public issue.** Read [SECURITY.md](SECURITY.md) and write to the maintainers privately.

## Setting up your environment

### Prerequisites

- **Node.js 22.12 or newer** (`package.json` declares `"engines": { "node": ">=22.12" }`). CI and the production Docker image both run Node 22, so Node 22 is the safest choice. Check with `node --version`.
- **npm**, which comes with Node. The repository ships a `package-lock.json`, so please use npm rather than yarn or pnpm.
- **git**.

You do **not** need an Anthropic API key, a RevenueCat account or a Fly.io account to work on Mecena. Without a key, every AI call runs on deterministic mocks, and purchases run in a mock mode that charges nothing.

### 1. Fork and clone

If you are not a maintainer, fork <https://github.com/lgarbayo/mecena> on GitHub ("Fork" button, top right), then clone your fork:

```sh
git clone https://github.com/<your-github-user>/mecena.git
cd mecena
git remote add upstream https://github.com/lgarbayo/mecena.git
```

Maintainers can clone `lgarbayo/mecena` directly and skip the fork.

### 2. Install the dependencies

```sh
npm ci
```

`npm ci` installs exactly the versions in `package-lock.json`, the same way CI and the Dockerfile do. Use `npm install <package>` only when you are deliberately adding or upgrading a dependency.

### 3. Create your `.env.local`

```sh
cp .env.example .env.local
```

That is enough. With the defaults in `.env.example`:

- `ANTHROPIC_API_KEY` is empty, so onboarding, matching explanations, the dossier, drafting and the jury all answer with deterministic mocks.
- `NEXT_PUBLIC_PURCHASES_MOCK=1` turns the paywall into a test mode: Pro and credits are "bought" without charging anything.
- `MECENA_SIGNUP_CODE` is empty, so anyone can create an account locally without an invite code.
- `MECENA_DATA_DIR=./data/runtime` keeps the local JSON database, uploads and PDFs in a folder that git ignores.

The comments in `.env.example` explain what each group of variables does. If you want to try the real AI, put your own key in `ANTHROPIC_API_KEY` (it is billed to your Anthropic account). `.env.local` is git-ignored (`.gitignore` excludes every `.env.*` file except `.env.example`): never commit it, and never paste a key into an issue or PR. Next.js and the local MCP server (`npm run mcp`) both read it.

### 4. Run the app

```sh
npm run dev
```

Open <http://localhost:3000>. A fresh visit lands on `/empezar`, where you choose creator or pyme, and then on `/entrar` to create a local account. To try the app from a phone on the same network (handy for the voice onboarding), use `npm run dev:phone`, which listens on `0.0.0.0`.

### 5. Check that everything is green

```sh
npm run check   # TypeScript (tsc --noEmit, strict) + the Vitest suite
npm run build   # production build, the same `next build` the Dockerfile runs
```

If both pass on a clean clone, your environment is ready.

> **About Next.js.** Mecena runs on Next.js 16, which changes some APIs and conventions you may know from earlier versions. Before writing framework code, read the relevant guide in `node_modules/next/dist/docs/` (see `AGENTS.md`).

## Making a change, step by step

1. **Sync with `main`.** `main` is the only long-lived branch; there is no `develop`.

   ```sh
   git checkout main
   git pull upstream main     # maintainers: git pull origin main
   ```

2. **Create a descriptive branch.** Name it `<type>/<short-description>` in kebab-case, using the same types as the commit messages. These are real branch names from this repository:

   | Branch | What it was for |
   |---|---|
   | `feat/invite-codes` | a new feature |
   | `fix/mobile-layout` | a bug fix |
   | `docs/open-access` | documentation only |
   | `chore/track-agents-md` | housekeeping |
   | `chore/deploy-fly` | deployment and infrastructure |

   ```sh
   git checkout -b fix/locked-card-overflow
   ```

3. **Make your change**, with tests (see [Tests](#tests)) and a line in `CHANGELOG.md` (see [below](#keeping-changelogmd-up-to-date)).

4. **Run the checks before pushing.** These are the same commands CI runs on your PR:

   ```sh
   npm run check
   npm run build
   ```

5. **Commit** following [Conventional Commits](#commit-messages-conventional-commits) and push your branch:

   ```sh
   git push -u origin fix/locked-card-overflow
   ```

6. **Open a pull request against `main`** on <https://github.com/lgarbayo/mecena>. The PR template asks for a short description, the related issue (`Closes #123`) and a checklist.

7. **Review.** At least **one maintainer** reviews every PR, and a maintainer merges it once it is approved and CI is green. The same rule applies to the maintainers' own work: changes reach `main` through a pull request, not a direct push.

8. **Merge means production.** Every push to `main` runs `.github/workflows/deploy.yml`, which runs `npm run check` and then deploys to <https://mecena.fly.dev>. A deploy restarts the single machine, so the app is briefly unavailable. That is why only reviewed, green PRs are merged, and why a maintainer may occasionally hold a merge (for example during a live demo).

## Coding standards

Mecena has **no ESLint, Prettier or EditorConfig configuration**. The standard is the existing code, enforced by the TypeScript compiler in strict mode (`"strict": true` in `tsconfig.json`; CI's `lint` check runs `npm run typecheck`).

In practice:

- **TypeScript everywhere**, strict. Avoid `any`; validate external input with `zod`, as the existing routes and contracts do.
- **Match the surrounding code**: two-space indentation, double quotes, semicolons, `import type` for types, and the `@/` alias for imports from `src/` (for example `import { getProfile } from "@/server/store";`). This is close to Prettier's defaults, except that lines run longer (most stay under about 120 characters), so do not run Prettier with its default settings over existing files.
- **Do not reformat files you are not changing.** Without a formatter, a reformatted file hides the real change and makes review much harder. Keep diffs focused on what the PR is about.
- **Where code goes**: shared types and schemas in `src/contracts/`, one folder per feature in `src/features/` (for example `src/features/matching/`), storage and auth in `src/server/`, pages and API routes in `src/app/`, the MCP server in `src/mcp/`, maintenance scripts in `scripts/`.
- **Language**: code, comments, commit messages and the project documents (README.md, this guide, CHANGELOG.md) are in English. Text the user sees in the app is in Spanish, because Mecena's users are artists and pymes in Spain (for example the error `"Has hecho muchas peticiones a la IA en poco tiempo..."` in `src/server/ai-limits.ts`). A few guides in `docs/` written for Mecena's users or for the live demo, such as `docs/mcp.md` and `docs/demo-script.md`, are in Spanish too.
- **Comments explain why**, not what. A short doc comment at the top of a module saying what it is for is the house style.
- **Every AI call must keep working on mocks.** If you add a call to Claude, give it a deterministic mock path so the app, the tests and CI run without a key, and put it behind the per-user limits in `src/server/ai-limits.ts`.

## Tests

The tests use **Vitest** and live in `tests/`, one folder per area (`tests/matching/`, `tests/dossier/`, `tests/auth/`...), in files named `*.test.ts` or `*.test.tsx`.

```sh
npm test                          # the whole suite, once
npm run test:watch                # re-run on every change
npx vitest run tests/matching     # one folder
```

What you can rely on, thanks to `tests/setup.ts`:

- **AI is always forced to mocks** (`MECENA_AI_MOCK=1`, `ANTHROPIC_API_KEY` emptied), and purchases use the mock adapter. A test never spends money, even if your `.env.local` has a real key.
- **Every test gets a fresh temporary data directory** with fictional fixture calls from `src/fixtures/`, never the real `data/calls` or `data/demo`. Tests cannot see each other's data.
- `tests/helpers.ts` has the building blocks: `createUser`, `loginDemo`, `seedOnboardedCreator`, `grantPro` and `req` to call API routes with a session cookie.

When you fix a bug, add a test that fails without the fix. When you add a feature, cover the main path and at least one failure (for example: the paywall refuses before a purchase and works after it).

A few tests call the real APIs and are skipped unless you opt in, because they spend tokens on your key:

```sh
MECENA_LIVE_TESTS=1 ANTHROPIC_API_KEY=sk-ant-... npx vitest run tests/onboarding/live.test.ts
```

## Commit messages: Conventional Commits

Mecena follows [Conventional Commits](https://www.conventionalcommits.org/). A structured history tells at a glance what each commit does, makes `CHANGELOG.md` easy to write, and decides the next version number.

> This guide is based on qoomon's commit conventions. The `ops` and `style` types are extensions of that guide; they are not part of the conventionalcommits.org standard.

### Format

```
<type>(<optional scope>): <description>

<optional body>

<optional footer>
```

The blank lines between the three parts are required.

Special cases:

- **Initial commit**: `chore: init`
- **Merge commit**: keep git's default message, for example `Merge branch 'redesign/calls' into feat/elevenlabs-redesign`. Pull requests merged on GitHub get `Merge pull request #74 from lgarbayo/feat/kind-first-logo`.
- **Revert commit**: keep git's default message, `Revert "<subject of the reverted commit>"`.

### Types

- Changes relevant to the API or UI:
  - `feat`: adds, adjusts or removes a feature of the API or UI.
  - `fix`: fixes an API or UI bug of an earlier `feat`.
- `refactor`: rewrites or restructures code without changing API or UI behaviour.
  - `perf`: a special `refactor` that specifically improves performance.
- `style`: code style or purely visual polish that does not affect behaviour (white space, formatting, missing semicolons). In this repository it has also been used for small visual tweaks, for example `style(jury-ui): mark removed paragraphs with a tint instead of a side border`.
- `test`: adds missing tests or corrects existing ones.
- `docs`: affects documentation only.
- `build`: affects the build: build tools, dependencies, project version, the Dockerfile. Dependabot's npm and Docker updates use this type.
- `ops`: affects operations: infrastructure, `fly.toml`, deployment, CI/CD workflows in `.github/workflows/`, backups, monitoring. Dependabot's GitHub Actions updates use this type. (One older commit used `ci(deploy)`; use `ops` from now on.)
- `chore`: other housekeeping, such as the initial commit or editing `.gitignore`.

Do not invent other types. Older commits in the history used `wip`, `merge` and `redesign`; please do not use them.

### Scopes

The scope is **optional** and says which part of Mecena the commit touches. Use the scopes that already exist in the history. Most of them match a folder in `src/features/` or an area of the app:

| Scope | Area |
|---|---|
| `onboarding`, `voice` | the voice and text interview that builds the profile |
| `calls`, `calls-ingest`, `matching`, `history` | the calls catalogue, BDNS ingest and scoring |
| `dossier`, `works` | the artist's works and the dossier and its PDF |
| `drafting`, `jury`, `jury-ui` | application drafts and the simulated jury |
| `justification`, `panel` | grant justification and the B2B panel |
| `auth`, `account`, `purchases`, `paywall` | accounts, invite codes, RevenueCat and Pro |
| `agent`, `mcp`, `tools`, `ai` | the in-app agent, the MCP server, the shared tools, AI plumbing |
| `contracts`, `platform`, `api` | shared types, platform-wide concerns, API routes |
| `design`, `ui`, `mobile`, `brand` | design system, layout, mobile pass, logo |
| `demo`, `pitch`, `deploy` | demo scenarios, pitch material, deployment |

Several scopes can be combined with a comma when a commit really spans two areas: `fix(works,dossier): ...`. **Do not** use issue numbers as scopes; they go in the footer.

### Breaking changes

A commit that breaks something others rely on (an API route, an MCP tool, an environment variable, the shape of stored data) **must** add `!` before the colon, for example `feat(mcp)!: ...`. If the description is not enough to understand the break, explain it in the footer with `BREAKING CHANGE:`.

### Description

The description is **mandatory** and summarises the change.

- Use the imperative, present tense: "add", not "added" or "adds". Think "This commit will...".
- Do **not** capitalise the first letter.
- Do **not** end it with a period.

### Body

The body is **optional**. Use it to explain the motivation for the change and how it differs from the previous behaviour, in the imperative, present tense. Many Mecena commits use a short list of bullet points, one per user-visible change.

### Footer

The footer is **optional**, except for breaking changes.

- Reference issues: `Closes #123`, `Refs #64`.
- Breaking changes **must** start with `BREAKING CHANGE:`. For a one-line explanation, add a space after the colon; for a longer one, add a blank line after it.
- Trailers such as `Co-Authored-By:` also go here.

### Versioning

The version in `package.json` (currently `0.1.0`) follows the commits:

- A release containing a **breaking change** increments the **major** version.
- A release containing a `feat` or `fix` increments the **minor** version.
- Otherwise, increment the **patch** version.

### Examples

These come from, or are modelled on, real commits in this repository:

```
fix(voice): keep dictating across questions (iPhone Safari and Chrome)
```

```
feat(auth): add invite codes with a cap, expiry, cohort and gifted credits
```

```
fix(calls): size the locked card's overlay so the text never spills out of it

On a phone the headline wraps and the overlay (sized to the three blurred
bars, 56px) was too short: the headline and the Pro pill overflowed it.
Put the blurred bars behind an overlay in normal flow.

Refs #69
```

```
refactor(demo): reuse the demo product id from purchases
```

```
test(matching): cover free limit, search, min employees, age parsing, territory and ranking signals
```

```
docs(mcp): connect Claude Desktop and Claude Code to mecena.fly.dev with a personal token
```

```
ops(deploy): deploy to Fly on every push to main via GitHub Actions
```

```
chore: track AGENTS.md generated by next dev
```

A breaking change (a hypothetical example, not a real commit):

```
feat(auth)!: rename MECENA_SIGNUP_CODE to MECENA_INVITE_CODE

BREAKING CHANGE: deployments must rename the secret before the next deploy
(fly secrets set MECENA_INVITE_CODE=... -a mecena); the old name is ignored.
```

## Keeping CHANGELOG.md up to date

**Every significant change must add a line to `CHANGELOG.md`** in the same pull request: new features, bug fixes users would notice, changes in behaviour, new or renamed environment variables, security fixes and removals. Add it under the `[Unreleased]` section, in the right group (`Added`, `Changed`, `Fixed`, `Removed`, `Security`...), written for a person rather than a machine:

```markdown
## [Unreleased]

### Fixed

- The locked call cards no longer let the headline overflow on phones.
```

Why it matters: the commit log says what changed in the code, but the changelog tells users and anyone deploying Mecena what changed **for them**, in one place, without reading hundreds of commits. Because every merge to `main` goes straight to production, the changelog is also the quickest way to find out what a given deploy changed when something goes wrong.

Purely internal changes (a refactor with no visible effect, a test, a typo in a comment) do not need an entry.

**This rule applies to AI coding agents too.** If you use Claude Code, Copilot or any other agent to prepare a contribution, the agent must update `CHANGELOG.md` and follow these Conventional Commits rules exactly like a human contributor, and you remain responsible for reviewing what it wrote before opening the PR.

## Pull requests and review

- One PR, one purpose. A bug fix and an unrelated refactor are two PRs.
- Fill in the PR template: what the PR does and why, the related issue, and the checklist.
- For a visual change, add a screenshot (a phone-width one too if it touches layout; there is a dedicated mobile layout below 640px).
- CI must be green. Every PR runs the checks `build` (`npm run build`), `test` (`npm test`), `lint` (`npm run typecheck`) and the `check` job of "Deploy to Fly" (`npm run check`), plus a CodeQL scan. The deploy job never runs on a PR.
- Reviewers may ask for changes. Push new commits to the same branch; there is no need to open a new PR.
- At least one maintainer approves before a maintainer merges.

## Definition of done

A contribution is done when:

- [ ] It does what the issue or PR description says, and nothing unrelated.
- [ ] `npm run check` passes locally (TypeScript strict + Vitest).
- [ ] `npm run build` passes locally.
- [ ] New behaviour has tests, and a bug fix has a test that failed before the fix.
- [ ] It works with no `ANTHROPIC_API_KEY` (AI on mocks) and with the purchases mock.
- [ ] User-facing text is in Spanish; code, comments and commit messages are in English.
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]` if the change is significant.
- [ ] Commits follow Conventional Commits.
- [ ] Documentation (`README.md`, `.env.example`, `docs/`) is updated if the change adds a command, an environment variable or changes how something is set up.
- [ ] No secrets, personal data or local runtime data (`.env.local`, `data/runtime/`) are committed.
- [ ] CI is green and at least one maintainer has approved the PR.

Thank you again for helping Mecena grow.
