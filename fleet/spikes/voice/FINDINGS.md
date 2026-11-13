# Spike: live voice → profile + dossier (hero feature A3)

> **Status, 13/11/2026:** the whole pipeline runs end to end (replay script, local endpoint, browser demo,
> 5 unit tests). **No `ANTHROPIC_API_KEY` was available on this machine** (not in the environment, not
> in a repo-root `.env`), so every run so far used the **deterministic mock**. The mock latencies
> below are **simulated, not measured**. First thing to do with a key: `npm start` (about 3.5 min) and paste
> the summary table into §3. Everything that needs that check is marked **[verify with key]**.

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
  src/transcripts.js   3 onboarding transcripts (painter, illustrator, small business) + 1 artwork description
  test/spike.test.js   npm test
```

```bash
cd fleet/spikes/voice && npm install
npm start                          # all scenarios, real-time speech (~3.5 min)
npm run fast                       # 6x speech speed: stresses coalescing
node replay.js --scenario business # one scenario
node replay.js --image obra.jpg    # per-work sheet with the vision pass (live only)
npm run serve                      # http://localhost:8787 → demo.html
npm test
```

Key lookup: `ANTHROPIC_API_KEY` in the environment, else `ANTHROPIC_API_KEY=` in `.env` at the repo root
(this worktree's root, then the main checkout's root). `.env` is gitignored. Without a key, the script prints a yellow
**MOCK MODE** banner and repeats the reminder after the summary. Raw per-call data goes to `results/*.json` (gitignored).
`results/sample-mock-run.txt` is a committed example of the full output.

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
- The system prompt is frozen per mode (≈ 900 tokens). It carries `cache_control`, but it may be **below the minimum cacheable
  prefix** for the model, so do not count on cache hits. At these sizes it barely matters. **[verify with key: `cache_read_input_tokens`]**

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
  The mock handles all four. **[verify with key: that the real model uses `update` + the existing key rather than adding a duplicate item.
  If it duplicates, the engine already turns `add` with an existing key into `update`. A fuzzy title match on `add` would be the next guard.]**

## 2. Prompts and schemas (port these)

All in `src/prompts.js` and `src/schemas.js`, plain ES modules with no dependencies:

| Purpose | Prompt | Output schema | Model / settings |
|---|---|---|---|
| Live profile patch, creator | `extractorSystem("creator")` | `patchSchema("creator")` | `claude-sonnet-5-5`, thinking `between_tools` (= off), effort `low` |
| Live profile patch, business | `extractorSystem("business")` | `patchSchema("business")` | same |
| Dossier sections: bio, statement, series, cv / activity, team, projects | `dossierSystem(mode)` + `PREVIOUS_TEXT` + `WRITE: <ids>` | `dossierSchema(mode)` | `claude-sonnet-5-5` live. Consider `claude-opus-5-5` for the final pass only **[verify quality]** |
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

## 3. Latency

**Not measured yet: no API key on this machine.** The table is from the mock, where latency is a formula
(`450 ms + input/40 + output×2.2` per call). It only shows that the scheduler behaves: coalescing keeps one call in flight, and lag
stays bounded when calls are slower than speech. It says nothing about Claude.

Mock, real-time speech (`npm start`, simulated):

| call | n | p50 ms | p95 ms | max ms | lag p50 ms | lag p95 ms |
|---|---|---|---|---|---|---|
| extract | 33 | 1248 | 1988 | 2129 | 1249 | 1989 |
| dossier (dirty sections) | 25 | 1191 | 1545 | 1724 | – | – |
| dossier final pass | 3 | 3468 | 3670 | 3670 | – | – |
| sheet | 1 | 2680 | – | – | – | – |

10-12 extraction calls per 60 s onboarding (one per final result, minus coalesced ones). Final dossier ready 4.0-5.5 s after "Terminar" (simulated).
With 6x speech (`npm run fast`) coalescing kicks in: 7-9 calls per scenario with lag p95 about 3.7 s, and the calls never overlap.

What to measure with a key (the script prints all of it):

- `latency`: request → complete JSON, per call type. `ttft`: request → first token.
- `lag`: **speech final result → profile updated on screen**. This is the number the demo audience feels.
  Target: p50 ≤ 2.5 s, p95 ≤ 4 s for extraction. The final dossier should be ready ≤ 6 s after "Terminar".
- `tokens in/out` per scenario, for cost.

If the live extraction p50 is well above about 2.5 s: (1) check the output token count per call (trim `detail`, cap ops per call);
(2) send only the last about 60 words before `⟦NEW⟧` plus the state; (3) stream-apply ops; (4) try `claude-haiku-5-5` for
the patch only and keep Sonnet for the dossier.

## 4. Quality notes

What the spike shows (mock = an "ideal" model, so these are pipeline properties):

- The patch engine, validation, corrections, dirty-section tracking and dossier refresh work on all 3 transcripts
  (16, 17 and 20 facts) and the artwork sheet. The injected hallucination is rejected.
- Field coverage of the schemas is enough for the three personas: for each sentence of the transcripts there was a field to put it in.

What only a live run can show **[verify with key]**:

- Whether the model copies the `source` verbatim. Expect some rejections for paraphrased quotes, especially accents and "eh"/"bueno".
  `normalize()` already ignores accents, case and punctuation. If the rejection rate is above about 10 %, add a fuzzy match (token overlap
  ≥ 0.8) before discarding.
- Over-inference: e.g. adding "Galicia" when only "Lugo" was said, or "pintora contemporánea". The prompt forbids it, and the quote check limits
  the damage, because the value can still be embellished while the quote is real. Spot-check values against quotes.
- ASR noise on Galician names: "uxía" may come back as "ugía"/"o sea", "o corgo" as "el corgo", "a última fía" as anything.
  Chrome es-ES has no Galician vocabulary. Mitigation: the confirm/edit step in the UI (tap a field to fix it) and `ask_next`.
- Dossier tone: sober, reusing the user's words, no superlatives. Read the three dossiers out loud. If they sound generic,
  try `claude-opus-5-5` for the final consistency pass only (it runs once, after speech, so latency matters less).

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
   **single-flight + coalescing**; full transcript + compact state + `⟦NEW⟧`; `claude-sonnet-5-5`, thinking `between_tools`,
   effort `low`, structured outputs. Validate quotes server-side and apply the patch, then push the patch to the UI (SSE).
3. Dossier: separate single-flight loop, dirty sections only, ≥ 2 facts per section, ≥ 4 s apart, previous text sent back for stability.
4. On stop: flush → consistency pass over all sections (candidate for `claude-opus-5-5` if quality needs it).
5. Per artwork: photo → vision notes (in parallel with the speech) → sheet call when the artist stops talking about that work
   → show `follow_up_question` if something key is missing.
6. Every AI call behind the same interface as `createClaudeLLM` / `createMockLLM`, so the app runs and tests without a key (brief requirement).

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Real latency higher than the 2.5 s target | Profile lags behind speech; weaker wow | Measure first; then trim output, window the transcript, stream-apply ops, Haiku for the patch |
| Speech recognition quality on Galician names / noisy room | Wrong names on stage | Rehearse with the actual speaker; tap-to-edit; text fallback ready; good external mic |
| Demo phone is an iPhone / not Chrome | Mic flow may not work | Test today; bring an Android with Chrome; text fallback |
| No network / venue Wi-Fi | Both Web Speech and Claude fail | Phone hotspot; recorded replay (`replay.js` path) as a backup demo |
| Model paraphrases quotes → many rejected ops | Profile fills slowly | Fuzzy quote match; log the rejection rate in the first live run |
| Duplicated list items after corrections | Messy CV | `add` with an existing key → `update` (done); add a title-similarity merge |
| Audio goes to Google (Chrome) | Trust message conflicts with the product | Disclose in onboarding; server-side STT later |
| Structured-output schema compile on first request | One slow first call per schema | Pre-warm each schema at server start (one tiny call per mode) **[verify]** |
| Refusals on benign content | Missing update | Server-side `fallbacks: "default"` enabled; `stop_reason` checked; the session retries the words next call |
