---
id: WP-01
title: Voice onboarding that builds profile and dossier live, opening data screen and trust copy
deps: []
owns:
  - src/app/page.tsx
  - src/app/onboarding/**
  - src/app/confianza/**
  - src/app/api/onboarding/**
  - src/features/onboarding/**
  - tests/onboarding/**
status: pending
hours: 3
criteria: [Live demo wow, Applied AI depth, Real problem and impact]
---

**Team blocks:** A1, A2, A3 (Persona A). Demo beats 1-2. **Hero feature: never cut.**

## Goal
The first screen hooks with sourced data; `/onboarding` lets a creator or a pyme talk for ~60 s (or type) and watch the structured profile and the dossier sections fill in **live** next to the transcript, with the trust promise visible before recording.

## Consumes
- `useSpeechRecognition` (`src/components/voice/useSpeechRecognition.ts`, es-ES, `onFinal` per final chunk, `interim`, `supported`).
- `useApp()` (`src/components/shell/AppProvider.tsx`): active profile, `refresh()`.
- `POST /api/onboarding/turn` contract: `OnboardingTurnRequest` / `OnboardingTurnResponse` (`src/contracts/api.ts`); `OnboardingTurnResult`, `AiSlice<"onboardingTurn">` (`src/contracts/ai.ts`); `structured()` (`src/server/ai/llm.ts`, tier `fast`).
- Store: `appendSegment`, `getTranscript`, `getDossier`, `saveDossier`, `mergeProfile`, `saveProfile`.
- UI primitives `src/components/ui`, tokens in `src/app/globals.css` (feature styles: a CSS module inside your folders).

## Provides
- `/` opening data screen, `/onboarding` live onboarding, `/confianza` trust page.
- Real `onboardingAi.real` (Claude) + a much better deterministic `onboardingAi.mock` (keyword extraction: name after "me llamo/soy", city names, disciplines list, years, "quiero…" → fundingNeeds/projectIdea; fills the right section keys per kind).
- `processTurn()` in `src/features/onboarding/service.ts` (keep the signature; the agent/MCP do not call it).

## Acceptance criteria
- [ ] `/` shows 3 data points with linked sources exactly as in IDEA.md (≈50 % of artists below the minimum wage, Nebrija/UGR; 34 % of cultural workers self-employed vs 16 %, Cotec 2025; > 50 % of SMEs don't apply for aid through not knowing and 1 in 4 abandons, MuyPymes 2025), the slogan, and a CTA to `/onboarding`. No invented figures. (`tests/onboarding/home.test.tsx` renders it and checks the 3 source URLs.)
- [ ] Trust strip visible on `/onboarding` **before** the mic button: "El arte es tuyo; nosotros hacemos el papeleo", no generamos ni modificamos obra (solo recortar, enderezar y color), no entrenamos con tu obra, tú tienes la última palabra. `/confianza` expands it.
- [ ] Mic button uses Web Speech es-ES; each final chunk is POSTed as a turn while listening continues; interim text shown live; text input fallback always available (and the only input when `supported` is false).
- [ ] Profile panel shows fields as chips/rows that **highlight when they change** (`changedProfileFields`); dossier panel shows sections that animate in/update (`changedSectionKeys`); the follow-up question is shown as a prompt. No page reload.
- [ ] Works in both modes: creator section keys `statement|bio|series|works|cv|contact`, business `activity|team|projects|figures|location|contact` (`tests/onboarding/mock.test.ts`: the 3 `fixtureTranscript` segments produce displayName "Antía Varela", city "A Coruña", disciplines incl. "ilustración", and ≥ 3 creator sections; a business sentence produces business keys only).
- [ ] Turns are queued client-side so two quick chunks never race (sequential POSTs), and a failed AI call shows a retry without losing the transcript (`tests/onboarding/service.test.ts` for the server part).
- [ ] Real AI path: system prompt per SPEC "AI prompt outlines" (never invent facts, keep the user's words, sourceSegmentIds set); sends profile + current sections + last ~10 segments + new segment; uses `structured({tier:"fast"})`. Validated by schema; on `AiError` falls back to the mock result for that turn and logs.
- [ ] CTA at the end: creator → `/obras`, business → `/dossier`.
- [ ] Mobile-first at 360 px: transcript and live dossier stacked (dossier first-visible while talking), no horizontal scroll. `npm test` and `npm run build` green.

## Notes
- Chrome needs HTTPS (or localhost) for the mic: test via the tunnel in README (WP-09). `continuous` recognition stops on silence; the hook restarts it.
- Latency: send only the new final chunk; keep fast tier effort `low`; render the transcript optimistically.
- Do not add packages unless essential (request it below).

## Contract change requests
