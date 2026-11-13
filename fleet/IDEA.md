# Mecena — brief for the fleet (1hack 2026)

> "Tú creas. Mecena se encarga del papeleo."
> Product UI and demo language: Spanish from Spain (castellano, tú/vosotros, never voseo). Code, commits and code comments in English.

Decided by the team on 2026-11-13 ~21:00 CET. The build ends **Sat 2026-11-14 19:00 CET**; live demos 19:00-21:00. No video, no repo requirement, no published rubric: optimise for a **live wow demo in under 3 minutes**, a **real problem backed by data**, and **RevenueCat monetisation done properly** (the team targets RevenueCat, a sponsor).

## One-liner
An AI agent that takes creators (artists, illustrators, photographers…) **and small businesses / autónomos** through the whole public-and-private funding cycle: it builds your profile and **dossier by voice and photos**, finds the calls (convocatorias, becas, premios, residencias, subvenciones) you fit, drafts the application in your own voice, scores it with the call's official criteria before you submit (simulated jury), and later helps you justify the grant.

## The problem (real data — use these, with sources, in-app copy and pitch)
- Artists in Spain: ~50 % earn below the minimum wage; 46.9 % earn < 8,000 EUR/year; < 15 % can live only from art; 83.2 % have paid social security for < 5 years (Pérez Ibáñez & López-Aparicio, Nebrija/UGR survey of 1,100+ artists, 2016-17). Sources: https://masdearte.com/especiales/estudio-sobre-la-situacion-economica-de-los-artistas-en-espana/ , https://www.elespanol.com/cultura/arte/20170215/193980735_0.html , https://www.cnt.es/noticias/arte-profesionalizacion-o-precariedad/
- 34 % of cultural/creative workers are self-employed vs 16 % of the whole economy (Fundación Cotec, 2025). Source: https://www.bolsamania.com/noticias_amp/economia/economia--el-empleo-en-el-sector-cultural-aumenta-un-17-tras-la-pandemia-frente-al-8-del-conjunto-de-la-economia--19731138.html
- > 50 % of SMEs do not apply for public aid because they do not know about it, and 1 in 4 that start an application abandons it because of complexity (MuyPymes, Oct 2025). Source: https://www.muypymes.com/2025/10/02/mitad-pymes-ayudas-publicas-desconocimiento
- 200,000+ autónomos with 1-2 employees never applied for the Kit Digital (up to 3,000 EUR) because they thought it was not for them. Source: https://www.autonomosyemprendedor.es/articulo/todo-digital/kit-digital-mas-200000-autonomos-empleados-aun-han-solicitado-fondos-estan-disponibles/20250423164037042217.html
- Honest gap: there is NO data that arts grants go unclaimed (they are competitive). Do not claim "millions unclaimed for artists". The pitch is: precarity + autónomos lose aid through not knowing and complexity + nobody does the finding-and-preparing for them. The team will add its own survey data on the night.

## How public grants work (the domain model the app follows)
Publication (BOE/DOG/boletín provincial; all registered in BDNS, infosubvenciones.es) → short application window (often 15-30 business days) → electronic application (certificado digital/Cl@ve): form, declarations, **project memoria**, statement, artistic CV / company profile, **dossier/portfolio**, **budget**, certificates of being up to date with Hacienda and Seguridad Social → 10-day correction window (subsanación) → competitive evaluation by a committee with **scored criteria from the bases** → provisional resolution, allegations, final resolution (max ~6 months, silence = rejection) → payment (advance or on justification) → execution → **justification** (final memoria + invoices; bad justification ⇒ refund) → IRPF. Private calls (foundations, festivals, prizes) are simpler: web form + dossier + jury.
Legal line: **Mecena prepares; the user submits** with their own digital certificate. Never submit on their behalf.

## Users: two modes in one app
- **Creador/a** (artist, illustrator, photographer, musician…): dossier = artistic portfolio (statement, series, works with technical sheets, CV).
- **Pyme / autónomo**: dossier = company capability memoria (activity, team, projects, figures, CNAE, location). Calls = SME/autónomo aid (digitalisation, hiring, internationalisation, culture-industry aid…).
Same pipeline, profile has a `kind` field; matching filters by beneficiary type.
Beachhead for the pitch: visual artists and illustrators in Galicia; pymes show the expansion path.

## Core experience (priority order — cut from the bottom)
1. **Voice onboarding that builds profile AND dossier live (hero feature, the team's favourite).** The user talks (browser speech recognition, es-ES; text fallback) and, while they talk, the app streams the transcript to the AI which incrementally (a) fills the structured profile on screen and (b) builds the dossier, section by section, visibly growing next to the transcript. For creators: they also **photograph their works** with the phone; vision AI straightens/crops (light touch only — never alter the artwork), and the voice description of each piece fills its technical sheet (title, year, technique, size, series, concept). Output: a **dossier page + downloadable PDF** with a clean editorial template, plus call-specific variants ("this call wants 10 images, max 5 MB, put the social-impact series first").
2. **Dossier tools exposed via MCP**: an MCP server (stdio, official TypeScript SDK) exposing `get_profile`, `update_profile`, `build_dossier`, `export_dossier_pdf`, `search_calls`, `explain_call`, `draft_application`, `score_application`. The in-app agent uses the same tool functions; the MCP server lets Claude Desktop / Claude Code drive Mecena ("hazme el dossier para la convocatoria X"). One shared tools module, two front doors.
3. **Matched calls feed**: cards with amount, deadline, **why you fit** and **what you're missing**, plain-language summary of the bases and a document checklist. Data: a curated seed of ~25 REAL current calls (artists + pymes, Spain/Galicia, with source URLs) structured by the AI from their bases, plus a live BDNS ingest if its API proves usable (verify; cache fallback).
4. **"Prepárame la solicitud" → RevenueCat paywall → purchase (sandbox) → draft**: memoria + statement/company text + budget lines allowed by the bases + checklist, written **from the user's own words** (voice transcript), never generic.
5. **Simulated jury (tribunal simulado)**: several AI judges score the draft with the call's official criteria and weights, give per-criterion feedback; user applies fixes and the score rises live (e.g. 61 → 84).
6. "Ganadores parecidos a ti": past awards (BDNS concesiones, if available) as orientative evidence — never a fake precise probability.
7. Justification: photo of an invoice → OCR → assigned to a budget line, deviation alerts, final memoria. (Stretch.)
8. B2B panel for schools/associations (stretch; pitch slide only is fine).

## Monetisation with RevenueCat (must be real, sandbox)
Hormozi-style offer: free lead magnet = the dossier; sell the outcome, anchor against consultancies charging 10-15 % of the grant.
- **Gratis**: profile + dossier + 3 matched calls/month + plain-language bases.
- **Pro** subscription (monthly ~9 EUR / annual ~79 EUR): unlimited matches and alerts, drafts, simulated jury, call-specific dossier variants.
- **Solicitud premium** one-off purchase (~15 EUR) for users who won't subscribe.
- Entitlement `pro`; paywall triggers at "Prepárame la solicitud" and at the 4th match. Show a "Garantía: si en 90 días no has presentado 3 solicitudes, te devolvemos el dinero" line.
- Prefer a mobile-first web app with RevenueCat Web SDK (`@revenuecat/purchases-js`, Web Billing sandbox) unless the architect finds a faster path; verify current RevenueCat docs before coding. Without keys, a mock purchases adapter behind the same interface so the app and tests run.

## Trust and positioning (critical — artists distrust AI)
"El arte es tuyo; nosotros hacemos el papeleo." Never generate or modify artwork (only crop/straighten/colour-correct photos). No training on user works. The user has the last word on every text; drafts come from their own words. Show this in onboarding.

## Demo script (≤ 3 min, live, phone + projector)
1. Hook with 2 data points (precarity + autónomos lose aid).
2. A real artist from the room: speak 60 s + photograph 2-3 works → profile and dossier build live → PDF.
3. Matched calls with "por qué encajas / qué te falta"; switch to Pyme mode in one tap to show the second audience.
4. "Prepárame la solicitud" → RevenueCat paywall → sandbox purchase → draft in their voice.
5. Simulated jury 61/100 → apply fixes → 84/100.
6. (Optional) Claude Desktop calling Mecena's MCP: "hazme el dossier para la convocatoria X".
7. Close: survey numbers from tonight + LOIs from schools/associations.

## Tech constraints
- AI: Anthropic Claude via `@anthropic-ai/sdk` (claude-sonnet-5-5 for fast streaming extraction, claude-opus-5-5 for drafting and the jury). Team brings its own key via `.env` (`ANTHROPIC_API_KEY`). Every AI call behind an interface with a deterministic mock so tests run without keys.
- Speech: browser Web Speech API (es-ES) for the demo; text input fallback.
- Must run on a phone browser for the live demo (HTTPS or localhost tunnel), mobile-first UI, polished editorial look (it's an arts product).
- Persistence: simple (SQLite or JSON file); no auth beyond a demo user + RevenueCat app user id.
- Deploy target optional; local + tunnel is acceptable for the demo.
