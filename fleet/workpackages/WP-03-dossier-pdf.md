---
id: WP-03
title: Editorial dossier page and reliable PDF (creator and business) with call-specific variants
deps: []
owns:
  - src/app/dossier/**
  - src/app/api/dossier/**
  - src/features/dossier/**
  - tests/dossier/**
status: pending
hours: 3
criteria: [Live demo wow, Real problem and impact]
---

**Team blocks:** A5, A6 (Persona A). Demo beat 4 (and beat 8 via `build_dossier` / `export_dossier_pdf`).

## Goal
`/dossier` renders the dossier as a polished editorial page (creator: statement, bio, series, works with technical sheets, CV, contact; business: actividad, equipo, proyectos, cifras, CNAE, ubicación, contacto) and "Descargar PDF" produces a clean PDF that looks good on a projector. With `?callId=` it builds a variant adapted to the call (image limits, ordering, notes), gated as Pro.

## Consumes
- Store: `getProfile`, `getDossier`, `listWorks`, `getCall`, `exportsDir`, `saveDossier`; contracts `Dossier`, `DossierVariant`, `Call.dossierRequirements`, `ROUTES`, `API`.
- `@react-pdf/renderer` 4.9 (installed, listed in `serverExternalPackages`).
- `Paywall` (`src/features/purchases/ui/Paywall.tsx`, trigger `"dossier_variant"`) and `canDraft`/entitlement via `GET /api/entitlements` for the Pro gate.
- Work images: `/api/works/<id>/image` (uploads, read bytes with `readWorkImage` from `@/features/works/service`) or `/demo/...` files under `public/`.

## Provides
- `buildDossier`, `dossierUrl`, `renderDossierPdf`, `exportDossierPdf` (keep signatures; used by `src/tools/registry.ts`).
- `/dossier` page; `GET /api/dossier`, `GET /api/dossier/pdf`.

## Acceptance criteria
- [ ] Creator template: cover (name, disciplines, city), statement, bio, series, works grid (image + sheet: título, año, técnica, medidas, serie), CV (achievements, education), contact. Business template: actividad, equipo, proyectos, cifras (employees, revenue, founded, CNAE), ubicación, contacto. Empty sections hidden, not shown as blanks.
- [ ] `renderDossierPdf` uses `@react-pdf/renderer` with embedded images for uploads (read from disk, not via HTTP) and a font that renders Spanish accents; A4; ≤ 8 pages for the fixture creator. `tests/dossier/pdf.test.ts`: output starts with `%PDF`, size > 5 KB with 2 works, and the extracted text (or the render tree) contains "Antía Varela" and "Declaración" with accents intact.
- [ ] If the PDF renderer throws, fall back to the scaffold minimal PDF (keep it as `renderFallbackPdf`) so the download never 500s.
- [ ] Variant: `buildDossier({ callId })` limits works to `dossierRequirements.maxImages`, orders works so the series most related to the call (keyword overlap with call title/summary/criteria) comes first, and fills `variant.notes` in Spanish (e.g. "La convocatoria pide máx. 10 imágenes y 5 MB: hemos dejado 8 y comprimido el PDF"). `tests/dossier/variant.test.ts` with fixture calls.
- [ ] Variant UI is Pro: non-Pro users see the notes preview and a Paywall (`trigger="dossier_variant"`); Pro users see the adapted dossier. Plain dossier and PDF are always free (lead magnet).
- [ ] "Descargar PDF" works on a phone (opens `/api/dossier/pdf?profileId=…` in a new tab); `exportDossierPdf` writes the file and returns `{url, filePath, pages}`.
- [ ] Page looks editorial on mobile and projected (serif headings, generous whitespace, works in a 2-column grid ≥ 600 px, 1 column below). CTA → `/convocatorias`. `npm test` + `npm run build` green.

## Notes
- `@react-pdf/renderer` must only run server-side (route handler / service), never in a client component.
- MCP calls `export_dossier_pdf`; the returned `url` uses `MECENA_PUBLIC_URL` so the link opens on the phone.

## Contract change requests
- **CCR-dossier-style (open):** add `style?: "sobrio" | "editorial" | "galeria"` and `accent?: string` (hex) to `Dossier`, so the look the artist picks survives reloads and reaches `export_dossier_pdf` (MCP) and voice commands ("hazlo más sobrio"). Today the look lives in `?estilo=` / `?accent=` on `/dossier` and `/api/dossier/pdf`; without them `style.ts` suggests one from the call (`suggestStyle`) or the profile, so MCP exports already get a fitting look.
