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

4. **Entitlement**: *Product catalog → Entitlements* → **+ New** → identifier **`mecena_pro`** (the value of `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID`, also the code default). Attach **both subscriptions** (not the one-off).
5. **Offering**: *Product catalog → Offerings* → **+ New** → `default`, mark it as current, packages:
   - `$rc_monthly` → `mecena_pro_monthly`
   - `$rc_annual` → `mecena_pro_annual`
   - custom package `solicitud_premium` → `mecena_solicitud_premium`
6. **Keys**: *Project settings → API keys*:
   - Web Billing **sandbox public key** (`rcb_sb_…`), used in the browser.
   - **Secret key** (`sk_…`, V1 key of the same project), server only. **Never in a `NEXT_PUBLIC_*` variable, never committed.** On Fly: `fly secrets set REVENUECAT_SECRET_API_KEY=sk_… -a mecena`. **Without it, production refuses every purchase** (see §3).

## 2. Environment (`.env.local`, git-ignored)

```
NEXT_PUBLIC_REVENUECAT_API_KEY=rcb_sb_xxxxxxxx   # sandbox public key
REVENUECAT_SECRET_API_KEY=sk_xxxxxxxx            # REQUIRED for real purchases: the server verifies each one over REST
NEXT_PUBLIC_PURCHASES_MOCK=0
NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID=mecena_pro   # the entitlement identifier in the dashboard (code default too)
# NEXT_PUBLIC_REVENUECAT_OFFERING_ID=default     # default offering "default"
```

Restart `npm run dev` after editing (`NEXT_PUBLIC_*` values are inlined at build time).

## 3. How it works

- **App user id**: the SDK is configured with *our* id, one per Mecena account (`User.appUserId`, from `/api/auth/me`), not an anonymous one. The entitlement then survives a PWA reinstall and follows the account across devices, and the server can verify it. The server never takes an app user id from the client: `/api/entitlements`, the draft gate and the calls feed always use the signed-in user's. `/demo` → "Empezar de cero" rotates it for that account, so you get a fresh sandbox customer and the paywall shows again (the adapter calls `changeUser`).
- **Purchase**: the user picks a plan in our paywall (Hormozi offer) → `Purchases.purchase({ rcPackage, htmlTarget })`. The Web Billing checkout renders **inside our sheet**, so the PWA is never left. A user cancel maps to `{status:"cancelled"}`.
- **Unlock**: after a successful purchase the client POSTs `/api/entitlements`. The server **never trusts the client**: a `pro` or `premiumCredits` in the body is dropped, and the product id is only a hint. How it verifies depends on the server's configuration (`verificationMode()` in `src/features/purchases/server.ts`):

  | Server | What `POST /api/entitlements` does |
  |---|---|
  | `REVENUECAT_SECRET_API_KEY` set (Fly, any real build) | Reads `GET https://api.revenuecat.com/v1/subscribers/{appUserId}`. `pro` = the entitlement `mecena_pro` is active (its `expires_date` is stored as `expiresAt`). Premium credits = unique `mecena_solicitud_premium` transactions minus the credits already spent on drafts (`premiumUsed`, kept in our db). |
  | No secret, `NODE_ENV` ≠ production **and** `NEXT_PUBLIC_PURCHASES_MOCK=1` (local dev, tests, offline demo with `npm run dev`) | Grants the simulated purchase of that product id (Pro, or +1 credit). Never an arbitrary `pro` / credits value. |
  | Anything else (production or a non-mock build without the secret) | **Refuses**: 503 «No hemos podido comprobar tu compra…» and a `[purchases] Refusing an unverified purchase claim … REVENUECAT_SECRET_API_KEY is not set` line in the logs. Nothing is granted. |

  The gates (402 on `/api/applications`, the jury, the feed, dossier variants, deep research) only read the server state.
- **Restaurar compras**: the paywall and `/pro` have a «Restaurar compras» button → `POST /api/entitlements {"refresh":true}` (or `GET /api/entitlements?refresh=1`), which re-reads the customer from RevenueCat. Use it when the sync after paying failed («El pago se ha hecho, pero aún no hemos podido activar tu plan»). The draft gate also asks RevenueCat once before answering 402, so a paid-but-unsynced credit still drafts.
- **Expiry**: `resolveEntitlement` treats Pro as ended once `expiresAt` has passed and, with the secret key, re-reads RevenueCat lazily: renewed → new `expiresAt`; not yet renewed → not Pro, and reads keep asking at most once a minute for 24 h (renewals can lag), then stop. After a failed RevenueCat call, lazy re-syncs pause 30 s so pages do not each wait for a timeout.
- **Untrusted records**: a state without `verifiedAt` (written from a client claim before this verification existed) grants nothing outside the explicit mock mode. With the secret key it is verified on the next read; if RevenueCat is down meanwhile it still grants nothing, and its credits cannot be spent. A Pro granted by the server-side demo scenario (`activeProductId: "demo"`) is never re-verified or expired. Without the secret key in production, «Restaurar compras» answers 503 (it cannot verify) instead of «no hay compras».
- **Credits**: a draft reserves its credit atomically **before** the AI runs and gives it back if drafting fails; a double tap on «Prepárame la solicitud» waits for the same draft (one credit, one application).
- **Simulated jury**: Pro, or the runs included with an application without Pro: **5 per application** (`JURY_RUNS_PER_APPLICATION`; «Aplicar mejoras» counts as one). After that the jury answers 402 and opens the paywall (Pro plans only). A failed run is not counted.
- **What each plan sells**: the one-off «Solicitud premium» only unlocks a new draft, so the paywall shows it only from «Prepárame la solicitud» and on `/pro`. Locked matches, dossier variants, deep research and the jury offer Pro only. Pro also gets an in-app «Cierra en N días» alert on `/convocatorias` for matches with a published deadline within 7 days (no e-mail or push).
- **No keys** (tests, offline demo): `MockPurchases`. The paywall shows a "Modo prueba: no se cobra nada" confirm step and grants through the same `/api/entitlements` (needs the explicit mock mode above).

## 4. Testing a purchase

- Card **4242 4242 4242 4242**, any future date, any CVC.
- Sandbox subscriptions renew on an accelerated clock (monthly ≈ every 5 min) and stop after a few renewals.
- After buying: *Customers* in the dashboard shows the sandbox customer with the `mecena_pro` entitlement. Show this in the pitch.
- Check the server side: `fly logs -a mecena | grep purchases` must show no "Refusing an unverified purchase claim" line; if it does, the secret key is missing.
- Keep sandbox keys and links inside the team: anyone holding them can "buy" for free with test cards.

## 5. PWA notes

- If a service worker is added, RevenueCat (`api.revenuecat.com`), Stripe (`*.stripe.com`, `*.stripe.network`) and `/api/entitlements` must be **network-only**. A cached entitlement would show "not Pro" right after paying.
- Installing the PWA is not required for payments: the same flow works in Chrome and Safari.
- If the app is ever shipped to Google Play as a TWA, digital goods must use Google Play Billing. RevenueCat supports it with the same `mecena_pro` entitlement. This is not needed for the hackathon.
