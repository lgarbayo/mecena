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
//   - stop(): flush pending words, then a consistency pass with one dossier call per section, all
//     in parallel; each section is applied as soon as its call returns (the live text stays meanwhile).
//   - ordering: every dossier call gets a sequence number at launch and a section is only replaced by
//     a call launched after the one that wrote it, so a live call still in flight at stop() can never
//     overwrite the newer final text.

import { EventEmitter } from "node:events";
import { emptyProfile, validateOp, validateAskNext, applyOps, normalize } from "./profile.js";
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
    this.dossierSeq = 0; // launch order of dossier calls
    this.sectionSeq = {}; // section id -> seq of the call that wrote its current text
    this.timers = {};
    this.calls = [];
    this.rejected = [];
    this.keyFixes = []; // update ops whose misspelled list key was matched to an existing one
    this.rejectedAsks = []; // ask_next questions dropped by validateAskNext (e.g. mojibake)
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
          if (v.keyFix) {
            const fix = { field: op.field, ...v.keyFix };
            this.keyFixes.push(fix);
            this.emit("keyfix", fix);
          }
          const r = applyOps(state, [v.op]);
          state = r.state;
          changed.push(...r.changed);
          r.dirtySections.forEach((s) => this.dirty.add(s));
        }
        this.state = state;
        const ask = validateAskNext(res.ask_next);
        if (!ask.ok) {
          this.rejectedAsks.push({ n, ask_next: res.ask_next, reason: ask.reason });
          this.emit("ask_rejected", { n, ask_next: res.ask_next, reason: ask.reason });
        }
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
        this.emit("extracted", { call, changed, ask_next: ask.question, state: this.state });
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

  /** One dossier call. Applies only the requested sections, and only where no newer call already wrote them. */
  async #writeSections(sections, type) {
    const seq = ++this.dossierSeq;
    try {
      const res = await this.llm.dossier({ mode: this.mode, state: this.state, sections, previous: this.dossier });
      const applied = [];
      const discarded = [];
      for (const s of res.sections) {
        if (!sections.includes(s.id)) continue; // the model wrote a section it was not asked for
        if ((this.sectionSeq[s.id] ?? 0) > seq) {
          discarded.push(s.id); // stale: a later call (e.g. the final pass) already wrote this section
          continue;
        }
        this.sectionSeq[s.id] = seq;
        this.dossier[s.id] = { ...s, at: Date.now() };
        applied.push(s);
      }
      const call = { type, n: this.calls.length + 1, sections, latencyMs: res.latencyMs, ttftMs: res.ttftMs ?? null, usage: res.usage };
      if (discarded.length) call.discarded = discarded;
      this.calls.push(call);
      this.emit("dossier", { call, sections: applied });
      return true;
    } catch (err) {
      this.emit("error", err);
      return false;
    }
  }

  #dossier(sections) {
    sections.forEach((s) => this.dirty.delete(s));
    this.lastDossierStart = performance.now();
    this.dossiering = (async () => {
      try {
        if (!(await this.#writeSections(sections, "dossier"))) sections.forEach((s) => this.dirty.add(s));
      } finally {
        this.dossiering = null;
      }
      if (!this.stopped) this.#scheduleDossier();
    })();
    return this.dossiering;
  }

  /**
   * End of speech: flush everything, then the consistency pass, one call per section with content, all at
   * once. It does not wait for a live dossier call still in flight: that one is older, so whatever it
   * returns is applied only to sections the final pass has not written yet (and then overwritten).
   */
  async stop() {
    this.stopped = true; // no new live dossier calls: the final pass covers every section
    clearTimeout(this.timers.idle);
    clearTimeout(this.timers.dossier);
    // Flush. A final can still arrive meanwhile (the browser delivers the last one after "Terminar") and
    // nothing schedules it once stopped, so repeat while words are pending; bounded in case the API fails.
    for (let i = 0; i < 3 && (this.extracting || this.#pendingWords() > 0); i++) {
      await this.extracting;
      await this.#extract();
    }
    const all = Object.keys(DOSSIER_SECTIONS[this.mode]).filter((s) => this.#factsIn(s) > 0);
    await Promise.all(all.map((s) => this.#writeSections([s], "dossier-final")));
    this.emit("stopped", { state: this.state, dossier: this.dossier });
    return { state: this.state, dossier: this.dossier, calls: this.calls, rejected: this.rejected, keyFixes: this.keyFixes, rejectedAsks: this.rejectedAsks };
  }
}
