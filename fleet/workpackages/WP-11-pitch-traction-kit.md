---
id: WP-11
title: Pitch and traction kit (docs only, human-led, agent-assisted)
deps: []
owns:
  - docs/pitch/**
status: pending
hours: 2
criteria: [Real problem and impact, Sponsor fit (RevenueCat)]
---

**Team blocks:** A11, A12, A13 (Persona A, non-code) and B12, B13, B14, B15, B16 (Persona B, non-code). Run with `hk-pitch` / the `competitive-teardown` skill, not a builder slot; it touches no code.

## Goal
Everything the humans need for the non-code blocks, ready to use: survey and share copy, outreach workflow, LOI template, competitor teardown slide, pitch outline with the B2B slide, closing-numbers sheet and rehearsal plan.

## Consumes
- `fleet/IDEA.md` (data + sources), `fleet/team/PERSONA-A.md` / `PERSONA-B.md` (survey questions and LOI text in the annex), `fleet/SPEC.md` demo script, `fleet/outreach/CONTACTS.md` when it exists (read only; owned by the outreach thread).

## Provides
- `docs/pitch/survey.md` (B12): the 6 questions ready to paste into Tally/Google Forms + X and LinkedIn posts in Spanish (and Galician variant).
- `docs/pitch/outreach.md` (B13): message templates per contact type (artist, escuela de arte, asociación, gestoría, asociación de autónomos) and a priority workflow pointing at `fleet/outreach/CONTACTS.md`.
- `docs/pitch/loi.md` (B14): one-page LOI (from the PERSONA-B annex) + how to collect "sí, nos interesa" screenshots with consent.
- `docs/pitch/competition.md` (B15): teardown (Arte Informado and call aggregators, grant consultancies, generic AI writers) + one "en qué somos distintos" slide text.
- `docs/pitch/pitch.md` (A12): 3-minute talk track around the live demo: problem with sourced data, CEO vision (artistas → creadores → autónomos y pymes), data moat (calls + past awards), RevenueCat business model (free dossier lead magnet, Pro, one-off, 90-day guarantee), B2B schools/associations slide, beachhead (artistas visuales en Galicia).
- `docs/pitch/closing-numbers.md` (B16): table to fill at 15:00 Saturday (% who missed a call by finding out late, hours per application, % who would pay, # LOIs) and how to compute each from the survey export.
- `docs/pitch/rehearsal.md` (A11, A13): volunteer artist recruitment message and briefing, two full rehearsal runs 17:00-18:30 with a timing sheet and plan B (pre-recorded video).

## Acceptance criteria
- [ ] All 7 files exist, in Spanish from Spain, with no invented statistics (every figure links to a source in IDEA.md or is a placeholder "[rellenar con la encuesta]").
- [ ] Survey and LOI text match the PERSONA-B annex.
- [ ] Pitch fits 3:00 including the live demo beats from SPEC.

## Contract change requests
