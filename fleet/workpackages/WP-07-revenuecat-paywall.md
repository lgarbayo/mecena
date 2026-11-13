---
id: WP-07
title: RevenueCat Web Billing paywall, entitlements and the Hormozi offer
deps: []
owns:
  - src/app/pro/**
  - src/app/api/entitlements/**
  - src/features/purchases/**
  - docs/revenuecat.md
  - tests/purchases/**
status: review
hours: 3
criteria: [Sponsor fit (RevenueCat), Live demo wow]
---

**Team blocks:** B6, B7 (Persona B). Demo beat 6. **Never cut.**

## Goal
A beautiful mobile paywall sells the outcome (Pro mensual 9 €, Pro anual 79 €, Solicitud premium 15 €) with Hormozi-style copy, and a **real RevenueCat Web Billing sandbox** purchase unlocks the `pro` entitlement (or a premium credit) server-side. Without keys a mock adapter behind the same interface keeps the app and tests working.

## Consumes
- `PurchasesAdapter`, `Plan`, `PlanId`, `PRODUCTS`, `PACKAGES`, `ENTITLEMENT_PRO`, `PaywallTrigger`, `canDraft`, `publicEnv()`, `serverEnv().revenueCatSecretKey` (`src/contracts`).
- `@revenuecat/purchases-js` 1.74 (verified in node_modules: `Purchases.configure({ apiKey, appUserId })`, `getOfferings()`, `purchase({ rcPackage, htmlTarget?, customerEmail? })`, `getCustomerInfo()`, `changeUser()`, `isEntitledTo()`, `presentPaywall()`).
- Store `getEntitlement`, `saveEntitlement`, `getMeta`; `useApp().appUserId`.

## Provides
- `getPurchases()` (real `RevenueCatPurchases` when `!publicEnv().purchasesMock`, else `MockPurchases`), `Paywall` component (keep `PaywallProps`), `/pro` page.
- Server: `resolveEntitlement`, `requireDraftEntitlement`, `consumeDraftCredit`, `syncEntitlement` (keep signatures).
- `docs/revenuecat.md`: dashboard setup.

## Acceptance criteria
- [ ] Dashboard set up (document every step in `docs/revenuecat.md`): project, Web Billing app with Stripe test mode, products `mecena_pro_monthly` (9 €/mes), `mecena_pro_annual` (79 €/año), `mecena_solicitud_premium` (15 €, non-subscription), entitlement `pro` on both subscriptions, offering `default` with packages `$rc_monthly`, `$rc_annual`, `solicitud_premium`; sandbox public key `rcb_sb_…` in `.env.local` only (never committed).
- [ ] `RevenueCatPurchases`: configures with the app user id from `/api/profile` (re-`changeUser` after demo reset), maps offering packages to `Plan` using RevenueCat's formatted prices, `purchase()` renders checkout into the paywall sheet (`htmlTarget`), maps user cancel to `{status:"cancelled"}`, and on success POSTs `/api/entitlements` to sync, returning the server `EntitlementState`.
- [ ] Server sync: with `REVENUECAT_SECRET_API_KEY`, fetch `GET https://api.revenuecat.com/v1/subscribers/{appUserId}` and derive `pro` (active entitlement `pro`) and premium credits (count of `non_subscriptions.mecena_solicitud_premium` transactions minus credits used, store used count); without a secret key trust the client claim (sandbox demo only, documented). `source: "revenuecat"` in that mode. `tests/purchases/sync.test.ts` stubs `fetch` for the REST response.
- [ ] Mock: `MockPurchases.purchase` shows a "Modo prueba: no se cobra nada" confirm step and grants via `/api/entitlements`. `tests/purchases/server.test.ts`: premium credit allows exactly one new draft (`consumeDraftCredit`), Pro allows unlimited, none → `PaymentRequiredError`.
- [ ] Paywall copy (Spanish, Hormozi): headline sells the outcome ("Presenta más solicitudes, mejor preparadas"); value stack (convocatorias ilimitadas y alertas, solicitudes escritas con tus palabras, tribunal simulado, dossier adaptado a cada convocatoria); anchor "Una consultora se lleva un 10-15 % de tu beca. Con Mecena: 9 €/mes"; annual highlighted as best value; one-off for non-subscribers; guarantee "Garantía: si en 90 días no has presentado 3 solicitudes, te devolvemos el dinero"; free plan reminder (perfil + dossier + 3 convocatorias/mes). Trigger-specific subtitle for `draft_application`, `match_limit`, `jury`, `dossier_variant`, `pricing_page`.
- [ ] `/pro` shows the same offer as a page plus current status ("Eres Pro" / créditos premium). Paywall sheet fits a 360 px phone without horizontal scroll, has a close button, and calls `onPurchased` only after the server sync. `npm test` + `npm run build` green.

## Notes
- Start with the dashboard setup (it is the long pole). Test card 4242 4242 4242 4242. Each demo reset rotates the app user id → fresh sandbox customer.
- Never put the secret key in a `NEXT_PUBLIC_*` var.

## Contract change requests
