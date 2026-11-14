<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

These rules apply to every AI coding agent working in this repository, on top of the Next.js
notes above.

- **Update `CHANGELOG.md` for every significant change.** Add an entry under `[Unreleased]`, in
  the same pull request, under the right heading (`Added`, `Changed`, `Deprecated`, `Removed`,
  `Fixed`, `Security`). Write it as prose that explains *why* the change was needed, not a list of files,
  and reference the pull request number. For example: "Opening «Convocatorias» before finishing
  the profile spent the month's free matches on an empty profile; the free plan now shows an
  unsaved preview until the profile is complete. (#44)". Pure refactors and test-only changes do
  not need an entry.
- **Write Conventional Commits** (`type(scope): summary`), as described in `CONTRIBUTING.md`. For
  example: `fix(voice): keep dictating across questions` or `feat(dossier): live refresh of the
  free layout`.
- **Run `npm run check` (typecheck + tests) before you call the work finished,** and fix whatever
  it reports. The tests force AI mocks, so no API key is needed. Every push to `main` deploys to
  https://mecena.fly.dev, so a red check must never reach `main`.
