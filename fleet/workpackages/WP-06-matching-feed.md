---
id: WP-06
title: Matching engine and calls feed with why-you-fit, what's-missing and the creator/pyme mode switch
deps: []
owns:
  - src/app/convocatorias/**
  - src/app/api/calls/**
  - src/features/matching/**
  - tests/matching/**
status: pending
hours: 3
criteria: [Live demo wow, Applied AI depth, Sponsor fit (RevenueCat)]
---

**Team blocks:** B4, B5 (Persona B); B11 for `search_calls` / `explain_call` (service functions behind the shared tools); shows B3 ("ganadores parecidos") when `awards.json` exists. Demo beat 5.

## Goal
`/convocatorias` shows the calls the active profile fits, as cards with amount, deadline, **por qué encajas** and **qué te falta**; a call detail explains the bases in plain Spanish with a document checklist and "Prepárame la solicitud". One tap in the header switches creator ↔ pyme and the feed changes instantly. Free plan: 3 matches visible, the 4th+ locked behind the paywall.

## Consumes
- Store: `listCalls`, `getCall`, `getProfile`, `listAwards`, `updateDb` (`matchCache`); `resolveEntitlement` (`src/features/purchases/server.ts`) for the free limit; `FREE_MATCHES_PER_MONTH`.
- Contracts: `MatchResult`, `CallsResponse`, `CallResponse`, `ExplainFitInput/Result`, `AiSlice<"explainFit">`.
- `useApp()` (`setMode`), `Paywall` (trigger `"match_limit"`), `ROUTES.application(callId)` (WP-08 page).

## Provides
- `ruleMatch`, `searchCalls`, `explainCall` (keep signatures; used by `src/tools/registry.ts` → MCP).
- `ModeSwitch` (header seam), `/convocatorias`, `/convocatorias/[id]`, `GET /api/calls`, `GET /api/calls/[id]`.

## Acceptance criteria
- [ ] Hard filters in `ruleMatch`: beneficiary kind, age (from `birthYear`, at the call deadline), residence (region/province/city; empty = Spain-wide), legal form and max employees for business, deadline not passed (status `closed` excluded; `recurring`/`upcoming` allowed and labelled). Soft score 0-100: discipline/sector overlap, keyword overlap between profile (statement, projectIdea, fundingNeeds, achievements) and call (title, summary, criteria), amount fit, regional bonus. Reasons and missing items in Spanish (e.g. "Vives en A Coruña: cumple el requisito de residencia", "Te falta: certificado de estar al corriente con Hacienda").
- [ ] `tests/matching/rules.test.ts`: fixture creator matches `fixture-beca-artes-plasticas` (eligible, high score) and not `fixture-digitalizacion-pymes`; fixture business the reverse; a 40-year-old fails `maxAge: 35` with a "qué te falta"/why-not reason; a closed call is excluded.
- [ ] `explainFit` real: Claude fast tier, ≤ 4 bullets each + plain summary (SPEC prompt); results cached in `matchCache` keyed by profile.updatedAt + call.id + verifiedAt so the feed stays fast; mock = rules output. Feed cards use rule results immediately and AI explanations for the top results only.
- [ ] `GET /api/calls`: non-Pro users get the top `FREE_MATCHES_PER_MONTH` (3) unlocked and `lockedCount` for the rest (locked cards render blurred, tap → Paywall `match_limit`); Pro sees all. `tests/matching/routes.test.ts` asserts 3 + lockedCount for free and all for Pro (`grantPro`).
- [ ] Detail page: amount, deadline (with days left), organizer, official link to the bases, plain summary, checklist (required documents with what the user already has ticked), criteria with weights, "ganadores parecidos" (2-3 `PastAward` matched by callId or discipline/sector; hidden if none; copy "orientativo, no es una probabilidad"), CTA "Prepárame la solicitud" → `ROUTES.application(id)`, secondary "Dossier para esta convocatoria" → `/dossier?callId=`.
- [ ] `ModeSwitch` switches the active profile and the feed refetches without reload; the feed shows the mode ("Para artistas" / "Para pymes y autónomos"). Mobile cards are thumb-friendly; `npm test` + `npm run build` green.

## Notes
- Calls come from `MECENA_CALLS_DIR` (tests use the 3 fixture calls; the real ~25 land via WP-05). Don't hardcode ids.

## Contract change requests
