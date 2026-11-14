# RevenueCat Web Billing (WP-07)

Mecena is a web app / PWA, so it sells through **RevenueCat Web Billing** (Stripe underneath) with `@revenuecat/purchases-js`. No App Store or Google Play is involved. The demo runs on the **sandbox** (Stripe test mode).

## 1. Dashboard setup (one time, ~20-30 min)

1. **Project**: https://app.revenuecat.com → *Create new project* → `Mecena`.
2. **Web Billing app**: *Apps & providers* → add a **Web** app with **RevenueCat Billing (Web Billing)**. App name `Mecena`, support email, default currency **EUR**.
   - Payment processor: either create a **Sandbox (claimable)** Stripe account from RevenueCat (fastest, it cannot take real money) or connect your own Stripe account in **Test mode**.
3. **Products**: *Product catalog → Products* → in the Web Billing row, **+ New** (prices cannot be edited after saving):

   | Identifier | Name | Product type | Duration | Price |
   |---|---|---|---|---|
   | `mecena_pro_monthly` | Mecena Pro mensual | Auto-renewing subscription | 1 month | 9,00 EUR |
   | `mecena_pro_annual` | Mecena Pro anual | Auto-renewing subscription | 1 year | 79,00 EUR |
   | `mecena_solicitud_premium` | Solicitud premium | **Consumable** | — | 15,00 EUR |

4. **Entitlement**: *Product catalog → Entitlements* → **+ New** → `pro`. Attach **both subscriptions** (not the one-off).
5. **Offering**: *Product catalog → Offerings* → **+ New** → `default`, mark it as current, packages:
   - `$rc_monthly` → `mecena_pro_monthly`
   - `$rc_annual` → `mecena_pro_annual`
   - custom package `solicitud_premium` → `mecena_solicitud_premium`
6. **Keys**: *Project settings → API keys*:
   - Web Billing **sandbox public key** (`rcb_sb_…`), used in the browser.
   - **Secret key** (`sk_…`), server only. **Never in a `NEXT_PUBLIC_*` variable, never committed.**

## 2. Environment (`.env.local`, git-ignored)

```
NEXT_PUBLIC_REVENUECAT_API_KEY=rcb_sb_xxxxxxxx   # sandbox public key
REVENUECAT_SECRET_API_KEY=sk_xxxxxxxx            # optional but recommended: server re-verifies every purchase
NEXT_PUBLIC_PURCHASES_MOCK=0
NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID=mecena_pro   # the entitlement identifier in the dashboard (default "pro")
# NEXT_PUBLIC_REVENUECAT_OFFERING_ID=default     # default offering "default"
```

Restart `npm run dev` after editing (`NEXT_PUBLIC_*` values are inlined at build time).

## 3. How it works

- **App user id**: the SDK is configured with *our* id (`db.meta.appUserId`, from `/api/profile`), not an anonymous one. The entitlement then survives a PWA reinstall and the server can verify it. `npm run demo:reset` rotates it, so you get a fresh sandbox customer and the paywall shows again (the adapter calls `changeUser`).
- **Purchase**: the user picks a plan in our paywall (Hormozi offer) → `Purchases.purchase({ rcPackage, htmlTarget })`. The Web Billing checkout renders **inside our sheet**, so the PWA is never left. A user cancel maps to `{status:"cancelled"}`.
- **Unlock**: after a successful purchase the client POSTs `/api/entitlements`. With `REVENUECAT_SECRET_API_KEY` the server **ignores the client claim** and reads `GET https://api.revenuecat.com/v1/subscribers/{appUserId}`:
  - `pro` = active entitlement `pro`
  - premium credits = `mecena_solicitud_premium` transactions bought since the last sync, plus unused credits
  
  Without the secret key it trusts the claim (sandbox demo only). The draft gate (402 on `/api/applications`) only reads the server state.
- **No keys** (tests, offline demo): `MockPurchases`. The paywall shows a "Modo prueba: no se cobra nada" confirm step and grants through the same `/api/entitlements`.

## 4. Testing a purchase

- Card **4242 4242 4242 4242**, any future date, any CVC.
- Sandbox subscriptions renew on an accelerated clock (monthly ≈ every 5 min) and stop after a few renewals.
- After buying: *Customers* in the dashboard shows the sandbox customer with the `pro` entitlement. Show this in the pitch.
- Keep sandbox keys and links inside the team: anyone holding them can "buy" for free with test cards.

## 5. PWA notes

- If a service worker is added, RevenueCat (`api.revenuecat.com`), Stripe (`*.stripe.com`, `*.stripe.network`) and `/api/entitlements` must be **network-only**. A cached entitlement would show "not Pro" right after paying.
- Installing the PWA is not required for payments: the same flow works in Chrome and Safari.
- If the app is ever shipped to Google Play as a TWA, digital goods must use Google Play Billing. RevenueCat supports it with the same `pro` entitlement. This is not needed for the hackathon.
