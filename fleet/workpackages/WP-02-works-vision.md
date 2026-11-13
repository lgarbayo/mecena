---
id: WP-02
title: Photograph works and turn voice + vision into technical sheets
deps: []
owns:
  - src/app/obras/**
  - src/app/api/works/**
  - src/features/works/**
  - tests/works/**
status: pending
hours: 2.5
criteria: [Live demo wow, Applied AI depth]
---

**Team blocks:** A4 (Persona A). Demo beat 3.

## Goal
On `/obras` a creator photographs a work with the phone camera, says one sentence about it, and gets a technical sheet (título, año, técnica, medidas, serie, concepto) plus a light crop/straighten suggestion, never altering the artwork. Works then appear in the dossier (WP-03 reads them from the store).

## Consumes
- `useSpeechRecognition` (scaffold) for the per-piece voice note; `fileToDataUrl` (`src/lib/api-client.ts`).
- Contracts: `Work`, `TechnicalSheet`, `CropSuggestion`, `CreateWorkRequest`, `UpdateWorkRequest`, `DescribeWorkResult`, `AiSlice<"describeWork">`; `structured()` + `imageBlock()` from `src/server/ai/llm.ts` (tier `fast`).
- Store: `saveWork`, `getWork`, `listWorks`, `uploadsDir`.

## Provides
- `/obras` page; `GET/POST /api/works`, `GET/PATCH /api/works/[id]`, `GET /api/works/[id]/image`.
- `worksAi.real` (Claude vision) and an improved `worksAi.mock` (parses "se llama X", "de 2024", "acuarela/óleo/tinta…", "50 por 70" → "50 x 70 cm", "serie Y").
- `createWork`, `updateWork`, `readWorkImage`, `parseDataUrl` (keep signatures).

## Acceptance criteria
- [ ] `<input type="file" accept="image/*" capture="environment">` opens the camera on a phone; image is downscaled client-side (canvas, max 1600 px long edge, JPEG ~0.85) before upload so requests stay < 2 MB.
- [ ] While the photo uploads the user can dictate (or type) the description; the sheet appears as an editable card; "Confirmar ficha" sets `confirmed: true`. Every field editable; user has the last word.
- [ ] Crop/rotation applied **visually only** (CSS on the original), original preserved, toggle "Ver original". Copy: "Solo recortamos y enderezamos la foto. Tu obra no se toca."
- [ ] `tests/works/mock.test.ts`: voice "Se llama Redeira II, acuarela sobre papel de 2025, 50 por 70, de la serie Redeiras" → title "Redeira II", year 2025, technique contains "acuarela", dimensions "50 x 70 cm", series "Redeiras".
- [ ] `tests/works/routes.test.ts`: POST a tiny PNG data URL → 201 with `work.imageUrl` = `/api/works/<id>/image`; GET image returns the bytes with the right content-type; PATCH updates sheet fields and `order`.
- [ ] Real vision prompt per SPEC; sheet fields the user did not say and the image does not show stay empty (no hallucinated measures). On `AiError` fall back to the mock.
- [ ] Reordering (up/down) persists `order`; CTA "Ver mi dossier" → `/dossier`. In business mode the page explains photos are optional (products/workshop) and still works.
- [ ] `npm test` and `npm run build` green.

## Notes
- Next route params are a Promise (`{ params }: { params: Promise<{ id: string }> }`).
- Body size: keep uploads small; `next.config.ts` allows 12 MB for server actions only.

## Contract change requests
