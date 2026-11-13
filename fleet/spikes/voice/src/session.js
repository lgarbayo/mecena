// Live onboarding session: receives speech results, decides when to call Claude,
// applies validated patches and keeps the dossier in sync. Used by replay.js and server.js.
//
// Call strategy (see FINDINGS.md):
//   - interim results are only displayed, never sent to Claude;
//   - on each FINAL result: extract now if >= minWords new words are pending, otherwise
//     wait idleMs for more speech, then extract whatever is pending;
//   - single-flight: at most one extraction in flight; finals arriving meanwhile are
//     coalesced into the next call, which starts as soon as the current one returns;
//   - the dossier runs on its own single-flight loop, only for sections whose facts changed,
//     at most once every dossierGapMs;
//   - stop(): flush pending words, then one consistency pass over every section.

import { EventEmitter } from "node:events";
import { emptyProfile, validateOp, applyOps, normalize } from "./profile.js";
import { FIELDS, DOSSIER_SECTIONS } from "./schemas.js";

const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export class Session extends EventEmitter {
  constructor({ mode, llm, minWords = 6, idleMs = 1200, dossierGapMs = 4000, minFactsPerSection = 2 }) {
    super();
    Object.assign(this, { mode, llm, minWords, idleMs, dossierGapMs, minFactsPerSection });
    this.state = emptyProfile(mode);
    this.dossier = {}; // id -> { title, body, quotes_used, missing, at }
    this.transcript = "";
    this.sentUpTo = 0; // transcript offset already sent to the extractor
    this.finalsAt = []; // [{ offset, t }] arrival time of each final, for lag measurement
    this.extracting = null;
    this.dossiering = null;
    this.dirty = new Set();
    this.lastDossierStart = 0;
    this.timers = {};
    this.calls = [];
    this.rejected = [];
    this.stopped = false;
  }

  interim(text) {
    this.emit("interim", text);
  }

  final(text) {
    text = text.trim();
    if (!text) return;
    this.finalsAt.push({ offset: this.transcript.length, t: performance.now() });
    this.transcript += (this.transcript ? " " : "") + text;
    this.emit("final", text);
    this.#scheduleExtract();
  }

  #pendingWords() {
    return wordCount(this.transcript.slice(this.sentUpTo));
  }

  #scheduleExtract() {
    clearTimeout(this.timers.idle);
    if (this.extracting || this.stopped) return; // coalesced: picked up when the call returns
    if (this.#pendingWords() >= this.minWords) return void this.#extract();
    if (this.#pendingWords() > 0) this.timers.idle = setTimeout(() => this.#extract(), this.idleMs);
  }

  #extract() {
    clearTimeout(this.timers.idle);
    if (this.extracting || this.#pendingWords() === 0) return this.extracting;
    const newFrom = this.sentUpTo;
    const transcript = this.transcript;
    this.sentUpTo = transcript.length;
    const oldestFinal = this.finalsAt.find((f) => f.offset >= newFrom);
    const t0 = performance.now();
    const n = this.calls.length + 1;

    this.extracting = (async () => {
      try {
        const res = await this.llm.extract({ mode: this.mode, transcript, newFrom, state: this.state });
        const tnorm = normalize(transcript);
        // Validate sequentially against the evolving state (an op may update a key added by the same call).
        let state = this.state;
        const changed = [];
        for (const op of res.ops) {
          const v = validateOp(op, state, tnorm);
          if (!v.ok) {
            this.rejected.push({ op, reason: v.reason });
            this.emit("rejected", { op, reason: v.reason });
            continue;
          }
          const r = applyOps(state, [v.op]);
          state = r.state;
          changed.push(...r.changed);
          r.dirtySections.forEach((s) => this.dirty.add(s));
        }
        this.state = state;
        const call = {
          type: "extract",
          n,
          words: wordCount(transcript.slice(newFrom)),
          latencyMs: res.latencyMs,
          ttftMs: res.ttftMs ?? null,
          lagMs: oldestFinal ? Math.round(performance.now() - oldestFinal.t) : null,
          wallMs: Math.round(performance.now() - t0),
          ops: res.ops.length,
          applied: changed.length,
          usage: res.usage,
        };
        this.calls.push(call);
        this.emit("extracted", { call, changed, ask_next: res.ask_next, state: this.state });
      } catch (err) {
        this.sentUpTo = Math.min(this.sentUpTo, newFrom); // retry these words next time
        this.emit("error", err);
      } finally {
        this.extracting = null;
      }
      if (!this.stopped) {
        this.#scheduleExtract();
        this.#scheduleDossier();
      }
    })();
    return this.extracting;
  }

  #factsIn(section) {
    let n = 0;
    for (const [f, spec] of Object.entries(FIELDS[this.mode])) {
      if (spec.section !== section) continue;
      n += spec.kind === "scalar" ? (this.state.fields[f] ? 1 : 0) : Object.keys(this.state.lists[f]).length;
    }
    return n;
  }

  #scheduleDossier() {
    if (this.dossiering || this.stopped) return;
    const ready = [...this.dirty].filter((s) => this.#factsIn(s) >= this.minFactsPerSection);
    if (!ready.length) return;
    const wait = this.lastDossierStart + this.dossierGapMs - performance.now();
    clearTimeout(this.timers.dossier);
    if (wait > 0) return void (this.timers.dossier = setTimeout(() => this.#scheduleDossier(), wait));
    this.#dossier(ready);
  }

  #dossier(sections, { final = false } = {}) {
    sections.forEach((s) => this.dirty.delete(s));
    this.lastDossierStart = performance.now();
    const n = this.calls.length + 1;
    this.dossiering = (async () => {
      try {
        const res = await this.llm.dossier({ mode: this.mode, state: this.state, sections, previous: this.dossier });
        for (const s of res.sections) this.dossier[s.id] = { ...s, at: Date.now() };
        const call = { type: final ? "dossier-final" : "dossier", n, sections, latencyMs: res.latencyMs, ttftMs: res.ttftMs ?? null, usage: res.usage };
        this.calls.push(call);
        this.emit("dossier", { call, sections: res.sections });
      } catch (err) {
        sections.forEach((s) => this.dirty.add(s));
        this.emit("error", err);
      } finally {
        this.dossiering = null;
      }
      if (!this.stopped) this.#scheduleDossier();
    })();
    return this.dossiering;
  }

  /** End of speech: flush everything, then one consistency pass over all sections with content. */
  async stop() {
    clearTimeout(this.timers.idle);
    clearTimeout(this.timers.dossier);
    await this.extracting;
    await this.#extract();
    this.stopped = true;
    await this.dossiering;
    const all = Object.keys(DOSSIER_SECTIONS[this.mode]).filter((s) => this.#factsIn(s) > 0);
    if (all.length) await this.#dossier(all, { final: true });
    this.emit("stopped", { state: this.state, dossier: this.dossier });
    return { state: this.state, dossier: this.dossier, calls: this.calls, rejected: this.rejected };
  }
}
