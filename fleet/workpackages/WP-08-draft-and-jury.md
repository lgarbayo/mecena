---
id: WP-08
title: Draft the application from the user's own words and run the simulated jury (61 → 84)
deps: []
owns:
  - src/app/solicitud/**
  - src/app/tribunal/**
  - src/app/api/applications/**
  - src/app/api/jury/**
  - src/features/drafting/**
  - src/features/jury/**
  - tests/drafting/**
  - tests/jury/**
status: pending
hours: 3
criteria: [Applied AI depth, Live demo wow, Sponsor fit (RevenueCat)]
---

**Team blocks:** B8, B9 (Persona B); B11 for `draft_application` / `score_application` (service functions behind the shared tools). Demo beats 6 (after purchase) and 7. **B8 never cut; B9 may fall back to one judge.**

## Goal
`/solicitud/[callId]` creates the draft (memoria, statement or company text, budget with lines allowed by the bases, checklist) written from the user's transcript, showing which of their sentences each section came from; behind the paywall. `/tribunal/[applicationId]` runs 3 AI judges on the call's official criteria, shows per-criterion scores and fixes, and "Aplicar mejoras" revises the draft and re-scores live (demo: **61 → 84**).

## Consumes
- Contracts: `Application`, `ApplicationDraftContent`, `DraftApplicationInput`, `ReviseApplicationInput`, `JudgeApplicationInput`, `JudgeVerdict`, `JuryScore`, `CriterionScore`, `CreateApplicationRequest`, `JuryResponse`, `JuryLatestResponse`, `JuryImproveRequest`, `ROUTES`.
- Store: `getTranscript`, `getProfile`, `getCall`, `listWorks`, `getDossier`, `findApplication`, `saveApplication`, `getApplication`, `listJuryScores`, `latestJuryScore`, `saveJuryScore`.
- `requireDraftEntitlement`/`consumeDraftCredit` (WP-07 server), `Paywall` (trigger `draft_application`), `ApiClientError.paymentRequired`, `useApp().appUserId`.

## Provides
- `draftApplication(input, ctx)`, `scoreApplication(id)`, `improveApplication(input)`, `JUDGES` (keep signatures; tools registry/MCP use them).
- Pages and `POST /api/applications`, `GET/PATCH /api/applications/[id]`, `GET/POST /api/jury`, `POST /api/jury/improve`.

## Acceptance criteria
- [ ] `/solicitud/[callId]`: shows call header; "Prepárame la solicitud" POSTs; on 402 opens `Paywall` and retries automatically after `onPurchased`; then shows a progress state ("Leyendo las bases… Usando tus palabras… Ajustando el presupuesto…") and the draft. If a draft exists for that call it loads it instead of re-drafting (no double credit use).
- [ ] Each section shows "Escrito con tus palabras" with the source sentences (from `sourceSegmentIds`) expandable; gaps render as highlighted "[Completa: …]"; every section and budget line is editable (PATCH). Budget lines only use `call.allowedExpenses` (when non-empty), totals shown, capped by `amountEur.max`. Checklist from `requiredDocuments` + Hacienda/Seguridad Social certificates. Footer: "Mecena prepara; tú presentas con tu certificado digital".
- [ ] `tests/drafting/mock.test.ts`: mock draft for the fixture creator + `fixture-beca-artes-plasticas` has sections `memoria` and `statement` whose bodies contain phrases from `fixtureTranscript`, non-empty `sourceSegmentIds`, budget lines all in `allowedExpenses`, total ≤ 9000, and a checklist covering every required document.
- [ ] Real drafting: Claude smart tier with the SPEC prompt (criteria-aware, never invent, quote/paraphrase transcript, `[Completa: …]` for gaps); on `AiError` → 502 with a retry button.
- [ ] Jury: 3 personas (creator calls: técnica de la administración, comisaria independiente, gestor cultural; business calls: técnico de la agencia, consultora de innovación, evaluador de impacto), run in parallel, scores clamped to `maxPoints`, averaged, normalised to 100. If `call.criteria` is empty use estimated generic criteria (labelled "estimados"). Every score shows the disclaimer.
- [ ] **Deterministic mock: total exactly 61 for application version 1 and exactly 84 after one `improveApplication`** for any call with criteria (distribute points per criterion so the rounded total hits the target; weaker criteria get the fixes). Mock fixes are concrete Spanish actions tied to the user's facts. `tests/jury/mock.test.ts` asserts 61 → 84 for both fixture creator and business calls.
- [ ] `/tribunal/[applicationId]`: big score with animated count-up, per-criterion bars (points/max) with each judge's comment, list of fixes with checkboxes (all checked by default), "Aplicar mejoras" → improve → animates from previous to new total and shows what changed in the draft. Link back to the draft. `npm test` + `npm run build` green.

## Notes
- `improveApplication` must use only facts present in the transcript/profile (revise prompt).
- Use the demo call ids listed by WP-05 in `data/calls/SOURCES.md` when testing by hand; tests use fixtures only.

## Contract change requests
