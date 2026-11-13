---
id: WP-10
title: "STRETCH: grant justification from invoice photos and a B2B panel for schools"
deps: [WP-08]
owns:
  - src/app/justificacion/**
  - src/app/escuelas/**
  - src/app/api/justification/**
  - src/features/justification/**
  - tests/justification/**
status: pending
hours: 3
criteria: [Real problem and impact, Applied AI depth]
---

**Team blocks:** B10 (Persona B); B2B panel supports the A12 pitch slide. **Only start if every core WP is merged and the 16:00 freeze is > 3 h away.** First thing to cut.

## Goal
After a grant is awarded, the user photographs an invoice; AI reads it (supplier, date, concept, base, IVA, total), assigns it to a budget line of the application, and warns about deviations; a final-memoria skeleton is generated. `/escuelas` is a static-but-real-looking B2B panel (a school sees its students' dossiers and applications pipeline) for the pitch.

## Consumes
- `Application`, `BudgetLine` (WP-08 data via store `getApplication`, `findApplication`); `structured()` + `imageBlock()` + `isMockAi()` from `src/server/ai/llm.ts` (keep the AI slice local to this feature: a `real`/`mock` pair chosen with `isMockAi()`, no change to `AiService`).
- Store `dataDir()` for a feature-local JSON file `<data>/justification.json` (do not change `Db`).

## Provides
- `/justificacion`, `/escuelas`, `POST /api/justification/invoices`, `GET /api/justification?applicationId=`.

## Acceptance criteria
- [ ] Invoice photo → parsed fields (mock: deterministic sample invoice) → assigned to the best-matching budget line by `expenseType`/concept; per-line executed vs budgeted with alert when > 100 % or when an expense type is not allowed by the call. `tests/justification/assign.test.ts`.
- [ ] "Memoria final" skeleton in Spanish built from the application sections + executed lines.
- [ ] `/escuelas`: panel with 3 demo students (from seed-like constants inside the feature), counts by stage (perfil, dossier, solicitud, presentada), clearly labelled "Demo". No auth.
- [ ] `npm test` + `npm run build` green.

## Contract change requests
