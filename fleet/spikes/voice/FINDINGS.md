# Spike: live voice → profile + dossier (hero feature A3)

> **Status, 13/11/2026:** the whole pipeline runs end to end (replay script, local endpoint, browser demo,
> 5 unit tests) and has been **measured against the live Claude API** (two full real-time runs: all-Sonnet, and
> Haiku for extraction). Numbers in §3, quality notes in §4. Still unverified: the browser side on a real phone (§5).

## 0. What is here / how to run

```
fleet/spikes/voice/
  replay.js            npm start: replays 3 transcripts word by word + per-work sheet, prints evolution + latency
  server.js            npm run serve: tiny HTTP + SSE endpoint used by demo.html (same Session code)
  demo.html            Web Speech API (es-ES, continuous, interim) + text fallback, Spanish UI
  src/schemas.js       field catalogue + all JSON schemas (patch, dossier, sheet, image notes)   ← port
  src/prompts.js       all system prompts                                                        ← port
  src/profile.js       pure patch engine: validate (verbatim quote), apply, history, dirty sections ← port
  src/session.js       call scheduler: debounce, single-flight coalescing, dossier loop, flush   ← port
  src/llm.js           @anthropic-ai/sdk client (streams to measure TTFT)                        ← port
  src/mock.js          deterministic oracle + template dossier (used when no key)
  src/calls.js         3 REAL calls (Ministerio arte contemporáneo 2026, Rega, Igape Galicia Exporta) ← seed format
  variant.js           npm run variant: fit of each profile with each call + call-specific dossier variant
  fixtures/base-*.json base profile + dossier per scenario, exported from the live Sonnet run
  src/transcripts.js   3 onboarding transcripts (painter, illustrator, small business) + 1 artwork description
  test/spike.test.js   npm test
```

```bash
cd fleet/spikes/voice && npm install
npm start                          # all scenarios, real-time speech (~3.5 min)
npm run fast                       # 6x speech speed: stresses coalescing
node replay.js --scenario business # one scenario
node replay.js --image obra.jpg    # per-work sheet with the vision pass (live only)
npm run variant                    # fit + dossier variant per call (~35 s live)
npm run serve                      # http://localhost:8787 → demo.html
npm test
```

Key lookup: `ANTHROPIC_API_KEY` in the environment, else `ANTHROPIC_API_KEY=` in `.env` at the repo root
(this worktree's root, then the main checkout's root). `.env` is gitignored. Without a key, the script prints a yellow
**MOCK MODE** banner and repeats the reminder after the summary. Raw per-call data goes to `results/*.json` (gitignored).
`results/sample-mock-run.txt` (mock), `results/live-sonnet-run.txt` and `results/live-haiku-extract-run.txt` (live API) are committed examples of the full output.

## 1. Incremental extraction design

### 1.1 When to call

| Event | Action |
|---|---|
| Interim result | Display only (grey text). **Never sent to Claude.** Interims get rewritten all the time; extracting from them causes flicker and wasted calls. |
| Final result with ≥ 6 new words pending | Extract **now**. |
| Final result with < 6 new words | Wait 1.2 s of quiet, then extract what is pending ("sí", "eh, bueno" alone are not worth a call). |
| Final arrives while a call is in flight | **Coalesce**: no queue. When the call returns, a single new call takes all the pending text. At most one extraction in flight, so no out-of-order patches and no backlog if the model is slower than the speaker. |
| Profile changed | Mark the affected dossier sections dirty (field → section map in `schemas.js`). |
| Dirty section with ≥ 2 facts | Rewrite **only those sections**, on a second single-flight loop, at most every 4 s. |
| User taps "Terminar" | Flush pending words → one last extraction → one **consistency pass** over every section that has content. |

Why finals and not "every N words": Chrome closes a final result at each natural pause (one clause or sentence,
8-25 words in our transcripts), which is the right unit. If someone talks for a long time with no pause, the interim gets long.
In that case, add a fallback that extracts from the interim when it passes about 35 words. Not implemented; it was not needed with the scripted speech.

### 1.2 What to send

Each extraction sends **the compact current state + the full transcript** with a `⟦NEW⟧` marker where the unprocessed text starts.
It does not send a delta alone:

- A 60 s onboarding is about 150-190 words (about 1 000 characters, roughly 300-400 tokens). The full transcript is cheap, and the earlier text gives the
  context needed for "la expuse…" (what is "la"?) and for corrections that refer back.
- The state (values + source quotes, no history or timestamps: `stateForPrompt`) lets the model skip facts it already has and use
  existing keys for `update`.
- The system prompt + schema is frozen per mode and carries `cache_control`. **Measured: it caches** (~2.05-2.09 k tokens
  written on the first call of each scenario, read on every later call; uncached input grows from ~80 to ~1.8 k tokens).

### 1.3 Output: a patch, not the full profile

The extractor returns `{ ops: [...], ask_next }` through **structured outputs** (`output_config.format` with a JSON schema).
This guarantees valid JSON with no tool loop. Forced `tool_choice` returns a 400 on `claude-sonnet-5-5`, so tool use is not an option here anyway. Each op:

```json
{ "op": "set|add|update|remove", "field": "<enum per mode>", "key": "slug for list items",
  "value": "…", "year": "", "place": "", "detail": "", "source": "verbatim words from the transcript" }
```

- **Output tokens are the latency driver**, and a patch is usually 0-4 ops, while a full profile grows with every call.
- The patch says *what changed*, which the UI needs anyway: highlight, "corregido" badge, and which dossier sections to rewrite.
- No unions or nullables: `""` means "not said". This keeps the schemas simple and inside structured-output limits.

### 1.4 Anti-hallucination

1. Prompt rule: only what the speaker said about themselves; when unsure, skip it (a later chunk can add it).
2. **Every op carries a `source` quote, and code checks it is verbatim in the transcript** (accent/case/punctuation-insensitive,
   `validateOp`). Non-verbatim ops are **discarded** and logged. The mock injects one invented award ("Premio Nacional…") to
   prove the guard. The run shows `✗ descartado (source not verbatim in transcript)`.
3. A `year` must appear in its own quote (digits or "dos mil…"), or the year is dropped and the rest of the fact kept.
4. The dossier writer only gets the structured profile (with quotes), is told to reuse the quotes' wording, and returns
   `quotes_used` + `missing`. A section with too little data comes back empty with a "Falta: …" list, not padded.
5. The quotes are the raw material for the later drafting steps ("prepárame la solicitud" in the user's own words).

### 1.5 Anti-flicker

- Interims are never extracted, and only finals change the profile.
- `applyOps` ignores ops that do not change the normalised value, so a re-emitted fact does not re-render.
- A field changes only through an explicit op with a new quote. Nothing is ever cleared because the model "forgot" it.
- The dossier writer gets `PREVIOUS_TEXT` and is told to keep its wording unless new facts require a change. Sections are rewritten only when
  dirty, at most every 4 s.
- UI: a short highlight on changed rows (`.flash` in `demo.html`), with no reflow of untouched rows.

### 1.6 Corrections ("no, en realidad fue en 2023")

- The latest statement wins. Scalars: a new `set`. List items: `update` with the **existing key** (the state sent to the model includes keys).
  Retractions: `remove`.
- The engine keeps `history` per field/item, so the UI can show "corregido (antes: 4 personas)" and undo is trivial.
- The transcripts split each correction into its own final result, so the model sees the wrong fact first and the correction in a later call.
  Each scenario has one: painter exhibition 2022→2023, illustrator 6→7 álbumes, business 4→5 personas, artwork year 2023→2024.
  **Measured live:** both Sonnet and Haiku handled all four with `update` on the existing key (no duplicates). If a model
  duplicates, the engine already turns `add` with an existing key into `update`; a fuzzy title match on `add` would be the next guard.

## 2. Prompts and schemas (port these)

All in `src/prompts.js` and `src/schemas.js`, plain ES modules with no dependencies:

| Purpose | Prompt | Output schema | Model / settings |
|---|---|---|---|
| Live profile patch, creator | `extractorSystem("creator")` | `patchSchema("creator")` | **`claude-haiku-5-5`, thinking disabled**, effort `low` (or `claude-sonnet-5-5`, thinking `between_tools`, set `EXTRACT_MODEL`) |
| Live profile patch, business | `extractorSystem("business")` | `patchSchema("business")` | same |
| Dossier sections: bio, statement, series, cv / activity, team, projects | `dossierSystem(mode)` + `PREVIOUS_TEXT` + `WRITE: <ids>` | `dossierSchema(mode)` | `claude-sonnet-5-5` live. Live quality good enough; `claude-opus-5-5` not needed |
| Artwork technical sheet from voice | `SHEET_SYSTEM` | `SHEET_SCHEMA` (each field `{value, source, origin: voz/imagen/ninguno}`, dimensions in cm, `follow_up_question`) | `claude-sonnet-5-5` |
| Optional vision pass on the artwork photo | `IMAGE_NOTES_SYSTEM` | `IMAGE_NOTES_SCHEMA` (neutral description, medium hint, orientation, photo issues for crop/straighten, visible signature text) | `claude-sonnet-5-5` |

Field catalogue (`CREATOR_FIELDS`, `BUSINESS_FIELDS`): each field has `kind` (scalar/list), the dossier `section` it feeds
and a Spanish `label`. List items are `{title, year, place, detail}` + `source`, keyed by slug. Profile `kind`
matches the brief's `kind` field. Map to the app's contract types when porting (the shapes are flat on purpose).

Sheet rules worth keeping: the voice is the authority. The image may only fill technique/support, flagged `origin: "imagen"` so the UI
asks for confirmation. Title, year, series, concept and size never come from the image. "130 por 97" means 130 high × 97 wide.

Request settings used (`src/llm.js`):

```js
client.beta.messages.stream({
  model: "claude-sonnet-5-5",
  betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", // server-side retry on refusal
  thinking: { type: "between_tools" },          // Sonnet 5.5: no extended thinking ({type:"disabled"} is a 400)
  output_config: { effort: "low", format: { type: "json_schema", schema } },
  system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: "CURRENT_STATE: …\n\nTRANSCRIPT: … ⟦NEW⟧ …" }],
  max_tokens: 4096,
}).finalMessage()
```

Streaming is used only to measure time-to-first-token. Possible optimisation: parse the `ops` array as it streams and
apply each op as soon as its object closes. **[measure the TTFT vs total gap first]**

## 3. Latency (measured, live Claude API, 13/11/2026)

Real-time replay (`npm start`, x1 speed, 3 scenarios, 64-78 s of speech each). Logs: `results/live-sonnet-run.txt`,
`results/live-haiku-extract-run.txt`; raw JSON next to them. Network: home fibre in Galicia, standard tier.

**Run A: everything on `claude-sonnet-5-5`** (thinking `between_tools`, effort `low`, structured outputs)

| call | n | p50 ms | p95 ms | max ms | ttft p50 ms | lag p50 ms | lag p95 ms |
|---|---|---|---|---|---|---|---|
| extract | 33 | 2700 | 4570 | 5478 | 1168 | 2701 | 4571 |
| dossier (dirty sections) | 25 | 3050 | 5127 | 5978 | 1289 | – | – |
| dossier final pass | 3 | 8442 | 9252 | 9252 | 1226 | – | – |
| sheet (voice → technical sheet) | 1 | 5440 | – | – | 3200 | – | – |

**Run B: extract on `claude-haiku-5-5`** (thinking disabled, effort `low`); dossier and sheet stay on Sonnet

| call | n | p50 ms | p95 ms | max ms | ttft p50 ms | lag p50 ms | lag p95 ms |
|---|---|---|---|---|---|---|---|
| extract | 33 | **1969** | **3264** | 4092 | 1047 | **1970** | **3264** |
| dossier (dirty sections) | 26 | 3248 | 5693 | 5758 | 1312 | – | – |
| dossier final pass | 3 | 8005 | 9302 | 9302 | 1160 | – | – |
| sheet | 1 | 3439 | – | – | 1243 | – | – |

`lag` = speech final result → profile updated on screen (queue wait + call). Target was p50 ≤ 2.5 s, p95 ≤ 4 s.

- **Sonnet misses the target slightly (2.7 / 4.6 s); Haiku meets it (2.0 / 3.3 s).** The lag equals the latency: single-flight
  never queued a final at real speaking speed, so the scheduler adds nothing.
- Per scenario: 10-12 extract calls, 15-23 facts, ~50-55 k input tokens (most of it cache reads of the ~2 k-token system
  prompt + schema) and 6-8 k output tokens. Average ~760 output tokens per call; output size, not input, drives latency.
- First call per schema is slower (3.9 s on the first painter call, 4.4-6.2 s in an earlier x6 run with large coalesced
  deltas): structured-output grammar compile + cache write. **Pre-warm both modes at server start.**
- **Final dossier is ready 11-14.5 s after "Terminar"** (flush + final pass of 8-9 s), well above the 6 s target.
  It does not hurt the demo much because the live dossier is already ~90 % complete when the user stops, but the
  final pass should run **per section in parallel** (one call per section, each ~3 s) instead of one big call, and
  the UI should keep the live text visible while it runs.
- Cost (list price order of magnitude): ~60 k in / ~7 k out per onboarding on Sonnet, mostly cached → cents per user.

## 4. Quality notes (live)

Both runs, all three transcripts:

- **Quote validation:** 0 rejected ops on Sonnet, 1 on Haiku (an empty `birth_year` value, correctly dropped). The models
  copy `source` verbatim, so the fuzzy-match fallback is not needed now. Keep the check: it is cheap and it is the hallucination guard.
- **Corrections work on both models:** "no perdona fue en 2023" → exhibition year 2022→2023; "bueno 5 desde septiembre" →
  staff 4→5; title added to the graphic-novel project; "el año en realidad es 2024" in the artwork sheet → 2024. All
  show `corregido; antes: …` history. Haiku sometimes keeps the history inside the value ("4 personas, luego 5 desde
  septiembre") instead of replacing it; Sonnet replaces cleanly. Prompt fix: "on correction, the value is ONLY the new fact".
- **Over-inference (both models, same case):** the series *Terra queimada* got year 2017, which is the year of the fires
  it depicts, not of the series. Add to the prompt: "dates inside a description are not the item's date unless the user says so".
- **No invented facts** found in either run when checking every value against its quote. Haiku extracted slightly more
  items (17/18/23 vs 15/17/23 facts), e.g. "Mujeres que sostienen las aldeas" both as a theme and as a series.
- **Dossier tone:** sober, first person in the statement, reuses the user's words ("cómo el monte se queda vacío"),
  no superlatives. `falta:` lists are useful (missing budget, missing motivation). One glitch: the business activity
  text mixes the brand voice with the speaker's name ("Somos Marta Castro y mi hermana…"); the business prompt should
  write in "nosotros" using the company name, not the speaker's name.
- **Technical sheet from voice:** all 7 fields correct with quotes, the year correction applied, dimensions parsed to
  "130 × 97 cm". Sonnet 5.4 s, ~3.4 s in run B (network variance; the sheet model was the same).
- Not tested live: ASR noise on Galician names (the replay feeds clean text). Still the biggest quality risk; see §5/§7.

## 5. Browser side (Web Speech API)

`demo.html` uses `SpeechRecognition || webkitSpeechRecognition`, `lang = "es-ES"`, `continuous = true`,
`interimResults = true`, auto-restart in `onend`, and the text fallback. **Not yet tested on a real phone or with a real
microphone in this spike.** The JS is syntax-checked and the server/SSE path is tested with curl. Run the device checklist below.

Support (as far as known, verify on the demo devices):

| Browser | Status |
|---|---|
| Chrome desktop (Win/Mac/Linux) | Works. Recognition runs **on Google servers** (needs network; audio leaves the device). |
| Chrome Android | Works, with quirks: sessions end after each pause (we restart in `onend`); finals are sometimes re-delivered or repeated as the prefix of the next one (handled heuristically: only the new suffix is forwarded); a short beep on each restart on some phones. |
| Edge desktop | Works (Microsoft's cloud service). |
| Safari macOS / iOS | `webkitSpeechRecognition` exists (uses Siri/dictation, which must be enabled); `continuous` is unreliable. **Untested: if the demo phone is an iPhone, test it or use the text fallback.** |
| Firefox (all) | Not supported → text fallback. |
| In-app browsers (Instagram, WhatsApp…) | Usually not supported → text fallback. |

Requirements and limits:

- **Secure context:** HTTPS or `localhost`. For an Android phone over USB, `adb reverse tcp:8787 tcp:8787` and open
  `http://localhost:8787` (localhost counts as secure). Over Wi-Fi, use an HTTPS tunnel (cloudflared/ngrok) to the app server.
- Microphone permission prompt on first use. A denial lands on the text fallback with a Spanish message.
- Chrome stops after a few seconds of silence. The restart covers it, but a long silence may still end with a `no-speech` error (logged, harmless).
- **Privacy/positioning:** Chrome's recognition sends audio to Google. That does not fit well with "no training on your work / el arte es tuyo".
  Say so in the onboarding copy, or plan server-side STT later. Newer Chrome versions have on-device recognition options; not explored here.
- Fallback: the textarea sends typed text split into sentences as finals, so the extractor path is the same.

Device checklist (5 min, before the demo): open `npm run serve` on the demo phone → badge shows "Claude en directo" → read
the painter script → the profile fills in while speaking → say a correction → "corregido" appears → "Terminar" → full dossier.
Test once with airplane mode to see the error message. Test with the projector's audio around (room noise).

## 6. Recommended call strategy (for the app)

1. Browser: Web Speech es-ES, interims for display only. POST each **final** to the server (or send it over a WebSocket).
2. Server: one `Session` per onboarding (port `session.js`): extract on final if ≥ 6 new words, else after 1.2 s quiet;
   **single-flight + coalescing**; full transcript + compact state + `⟦NEW⟧`; **`claude-haiku-5-5`, thinking disabled,
   effort `low`, structured outputs** (measured 2.0 s p50 / 3.3 s p95 lag; same quality as Sonnet on these transcripts
   once the correction rule is added to the prompt). Keep `EXTRACT_MODEL` configurable to fall back to Sonnet. Validate quotes server-side and apply the patch, then push the patch to the UI (SSE).
3. Dossier: separate single-flight loop, dirty sections only, ≥ 2 facts per section, ≥ 4 s apart, previous text sent back for stability.
4. On stop: flush → consistency pass, **one call per section in parallel** on Sonnet (a single call measured 8-9 s).
   `claude-opus-5-5` not needed: Sonnet's dossier quality was good enough in the live run.
5a. Pre-warm: one tiny call per mode schema when the server starts (first call per schema is 1-2 s slower).
5. Per artwork: photo → vision notes (in parallel with the speech) → sheet call when the artist stops talking about that work
   → show `follow_up_question` if something key is missing.
6. Every AI call behind the same interface as `createClaudeLLM` / `createMockLLM`, so the app runs and tests without a key (brief requirement).

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Real latency higher than the 2.5 s target | Profile lags behind speech; weaker wow | Measured: Sonnet 2.7 s p50, Haiku 2.0 s p50. Use Haiku for the patch; trim output further if the venue network is slow |
| Final dossier 11-14 s after stop | Awkward wait at the end of the demo | Keep the live dossier on screen; parallel per-section final pass; show a "repasando…" state |
| Speech recognition quality on Galician names / noisy room | Wrong names on stage | Rehearse with the actual speaker; tap-to-edit; text fallback ready; good external mic |
| Demo phone is an iPhone / not Chrome | Mic flow may not work | Test today; bring an Android with Chrome; text fallback |
| No network / venue Wi-Fi | Both Web Speech and Claude fail | Phone hotspot; recorded replay (`replay.js` path) as a backup demo |
| Model paraphrases quotes → many rejected ops | Profile fills slowly | Measured 0-1 rejections per 33 calls; fuzzy match not needed yet |
| Duplicated list items after corrections | Messy CV | `add` with an existing key → `update` (done); add a title-similarity merge |
| Audio goes to Google (Chrome) | Trust message conflicts with the product | Disclose in onboarding; server-side STT later |
| Structured-output schema compile on first request | One slow first call per schema | Pre-warm each schema at server start (one tiny call per mode). Measured: first call per scenario 1-2 s slower |
| Refusals on benign content | Missing update | Server-side `fallbacks: "default"` enabled; `stop_reason` checked; the session retries the words next call |

## 8. Prompt changes after the live run

Applied in `src/prompts.js` after the measurements above (the numbers in §3/§4 are from the prompts before these edits;
not re-measured):

1. Corrections: the new value is only the corrected fact (Haiku had written "4 personas, luego 5 desde septiembre").
2. Dates inside a description are not the item's date (both models dated *Terra queimada* 2017, the year of the fires).
3. Business `activity` in the company's voice, not "Somos Marta Castro y mi hermana…".

## 9. Call-specific dossier variant (layer 2)

Two layers: the **base dossier** is built live from voice and does not depend on any call (it is the free lead
magnet and matching needs the profile first). The **variant** is generated per call after matching and is the
differentiator: the same facts, re-structured and re-weighted for the committee that will score them.

Pipeline (`variant.js`, prompts `FIT_SYSTEM` / `variantSystem(mode)`, schemas `FIT_SCHEMA` / `variantSchema(mode)`):

1. **Fit** (profile × call): per requirement `cumple / no_cumple / sin_datos` with the user's quote and an action;
   per criterion a strict estimate of today's points (clamped to the max in code), confidence, gap; overall
   `alto / medio / bajo / no_elegible`; `why_fit`, `missing`, and up to 3 questions that would raise the score most.
2. **Variant** (only for eligible pairs): mirrors the memoria structure the call prescribes (Rega's A–E), otherwise
   orders sections by criterion weight; every section tagged with the criteria it serves and the base sections it
   draws on; `omitted` (what was cut and why), `questions` per gap, `format_checks` per rule; anything the call scores
   that the user has not said is a visible **`[PENDIENTE: …]`**, never invented.
3. **Code checks**: numbers in the variant that appear nowhere in the profile / base dossier / call → flagged;
   placeholders counted.

Calls (`src/calls.js`): real criteria copied from the official texts. Ministerio de Cultura, producción e investigación
en arte contemporáneo 2026, line A (30 points: CV 6, aportación 12, ODS/igualdad/territorio 5, presupuesto 4, difusión 2,
DANA 1). Rega, Cidade da Cultura (100 points: concepto 45, viabilidad 30, oportunidad en la trayectoria 25, minimum 50,
memoria ≤ 30 pages in the A–E structure; criteria from the 2025 bases, the 2026 edition used the same procedure).
Igape Galicia Exporta Empresas 2026 (non-competitive; requirements only, including the IG192 programme). **All three
editions are closed today**; they are used for their real rules.

### Results (live, 13/11/2026; logs `results/variants-live-*-run.txt`, readable report `results/variants-live-*.md`)

| | Sonnet 5.5 (all 3 profiles) | Opus 5.5 variant (painter) |
|---|---|---|
| fit, 9 calls in parallel | p50 9.9 s, max 14.9 s | (fit on Sonnet) |
| variant | p50 20.0 s, max 20.5 s, ~2.6-2.9 k output tokens | p50 35.3 s, max 44.6 s, 3.1-4.8 k tokens |
| wall, fits ∥ then variants ∥ | 35 s | 56 s |
| numbers not backed by the profile | 0 in 6 variants | 0 in 3 variants |

Fit quality:

- Eligibility was correct in every case: the business is `no_elegible` for both artist calls, the illustrator is
  `no_elegible` for Igape, and the business is eligible for Igape with the **IG192 prerequisite flagged** (the kind of
  trap that sinks real applications).
- The scores are honest, not flattering: painter 12/30 Ministerio and 51/100 Rega (just above Rega's 50 cut-off),
  low because budget and dissemination plan do not exist yet. Questions target the points at stake ("¿Cuántos retratos
  y de qué formato… y cuánto te costaría?").
- Weak spot: painter × Igape came out `medio` instead of `bajo`; it hedged with the right questions (RETA, employees),
  but an artist exhibiting abroad is a poor fit for an SME export programme. Rule added to `FIT_SYSTEM` (not re-measured):
  business-programme calls for a creator without a business structure → `bajo` at most.

Variant quality (the differentiator):

- **Same painter, two calls, two different dossiers.** Ministerio: aportación artística first (12 pts), then values
  (igualdad de género, territorio, using her own "mujeres que sostienen las aldeas"), CV, budget, dissemination.
  Rega: exactly the A–E memoria structure, budget as a table capped at 8.000 € with every line `[PENDIENTE]`, and the
  question about what the mentor would change in her career (criterion C, 25 pts).
- Business × Igape: rewrites the company dossier into an export action plan, drops the digitalisation project
  (not eligible spending) and says why in `omitted`.
- Voice preserved: sections reuse the speaker's sentences ("cómo el monte se queda vacío", "porque nos lo piden mucho").
- `format_checks` caught real things: the 30-page limit, the A–E structure, the missing Anexo II, and that the edition
  is closed.
- Inherited error: Sonnet repeated the base dossier's "Terra queimada (2017)" (from the extraction bug fixed in §8);
  Opus wrote it correctly ("14 cuadros sobre los incendios de 2017"). Upstream fixes matter more than the variant model.
- Opus vs Sonnet: Opus is a bit sharper (more precise placeholders such as "cómo usarás los pigmentos de tierra en esta
  serie", ODS only "si tú lo quieres plantear", a full CV block), but it takes 1.8x the time and 1.5x the tokens.

### Recommendation for the app

- **Fit on `claude-sonnet-5-5`**, effort `medium`, all candidate calls in parallel right after onboarding (~10-15 s);
  show the cards as they arrive. Cache per (profile version, call).
- **Variant on `claude-sonnet-5-5` by default**, streamed section by section (20 s total; first section after about
  3-4 s if streamed). Offer **"Revisión final" on `claude-opus-5-5`** behind the Pro paywall, just before exporting the
  PDF, where 40 s is acceptable.
- `[PENDIENTE]` placeholders become tappable chips in the UI that open a **voice answer** to the attached question; the answer goes
  through the same extractor, the profile updates, and the variant and fit refresh. This closes the loop with the hero
  feature and makes the score rise visibly (e.g. Rega 51 → 70+ once budget and plan are said).
- Keep the number check server-side; block export while a variant has unbacked numbers.
- Seed calls must carry criteria with points, requirements with ids and format rules as in `src/calls.js`; the
  prompts depend on that structure.
