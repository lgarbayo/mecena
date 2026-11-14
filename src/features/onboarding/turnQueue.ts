/**
 * Client-side turn queue: chunks are POSTed strictly one after another (two quick final chunks never race),
 * and a failed turn blocks the queue (keeps order) until the user retries it. The text is never lost.
 *
 * Coalescing (FINDINGS.md 1.1 "single-flight + coalescing"): finals that arrive while a turn is in flight do not become
 * N turns. They are appended to the last queued turn when it has the same source and step, so the next POST carries all
 * the text said meanwhile. The backlog therefore never grows faster than one turn per server response, however slow
 * the model is: a final waits at most for the turn in flight plus its own (~2 x latency).
 *
 * A turn that takes long is flagged `slow` (say so in the UI) and one that never answers is aborted after
 * TURN_TIMEOUT_MS and becomes `failed`, so a hung request can never freeze the queue (a retry is safe: the
 * server reuses the stored segment of a repeated chunk, and a turn that was ever sent never takes more text).
 */
import type { OnboardingTurnResponse } from "@/contracts/api";

export type TurnStatus = "queued" | "sending" | "done" | "failed";
export type TurnSource = "voice" | "text";
export interface QueuedTurn {
  id: string;
  text: string;
  source: TurnSource;
  /** The onboarding step the text belongs to; finals of different steps are never merged. */
  step?: number;
  status: TurnStatus;
  segmentId?: string;
  error?: string;
  /** Still sending after TURN_SLOW_MS. */
  slow?: boolean;
}

export type SendTurn = (turn: { text: string; source: TurnSource; step?: number }, signal: AbortSignal) => Promise<OnboardingTurnResponse>;

/**
 * The server bounds a turn: 20 s per Claude attempt, one retry, a 45 s hard deadline, then the deterministic
 * extractor answers (ONBOARDING_* in ai.ts). 60 s = that deadline + network, store writes and margin, so only a
 * lost request (or a dead server) reaches it.
 */
export const TURN_TIMEOUT_MS = 60_000;
/** ~3x the Haiku p95 (2.9 s): past this the UI says it is taking longer than usual. */
export const TURN_SLOW_MS = 8_000;

export interface TurnQueueEvents {
  change(items: QueuedTurn[]): void;
  /** `turn` is the turn as sent (text, source, step), now done. */
  result(res: OnboardingTurnResponse, turn: QueuedTurn): void;
}

let seq = 0;

export class TurnQueue {
  private items: QueuedTurn[] = [];
  private running = false;
  /** Turns that were ever POSTed: their text is frozen (a retry must resend exactly the same chunk). */
  private readonly sent = new Set<string>();
  private waiters: (() => void)[] = [];

  constructor(
    private readonly send: SendTurn,
    private readonly events: TurnQueueEvents,
    private readonly timing = { timeoutMs: TURN_TIMEOUT_MS, slowMs: TURN_SLOW_MS },
  ) {}

  get snapshot(): QueuedTurn[] {
    return this.items;
  }

  /** Something is waiting to be sent or in flight. */
  get busy(): boolean {
    return this.items.some((t) => t.status === "queued" || t.status === "sending");
  }

  /** A failed turn is blocking the queue until retry(). */
  get hasFailed(): boolean {
    return this.items.some((t) => t.status === "failed");
  }

  /**
   * Queues a chunk. When the last turn is still queued (not sending, not failed, never sent) with the same source and
   * step, the text is appended to it (one space) and that turn is returned; otherwise a new turn is created.
   */
  enqueue(text: string, source: TurnSource, step?: number): QueuedTurn | undefined {
    const clean = text.trim();
    if (!clean) return undefined;
    const last = this.items.at(-1);
    if (last && last.status === "queued" && !this.sent.has(last.id) && last.source === source && last.step === step) {
      const merged: QueuedTurn = { ...last, text: `${last.text} ${clean}` };
      this.set([...this.items.slice(0, -1), merged]);
      void this.pump();
      return merged;
    }
    const turn: QueuedTurn = { id: `local-${++seq}`, text: clean, source, status: "queued", ...(step === undefined ? {} : { step }) };
    this.set([...this.items, turn]);
    void this.pump();
    return turn;
  }

  retry(id: string) {
    this.patch(id, { status: "queued", error: undefined });
    void this.pump();
  }

  /**
   * Resolves when nothing is queued or sending. Also resolves (immediately, if already so) when a failed turn blocks
   * the queue: the turns behind it stay queued until retry(), so waiting for them would never end. Check hasFailed.
   */
  idle(): Promise<void> {
    if (this.settled()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Same as idle() (kept for the tests that use it). */
  drain(): Promise<void> {
    return this.idle();
  }

  private settled(): boolean {
    return !this.running && (!this.busy || this.hasFailed);
  }

  private notify() {
    if (!this.waiters.length || !this.settled()) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  private set(items: QueuedTurn[]) {
    this.items = items;
    this.events.change(items);
  }

  private patch(id: string, p: Partial<QueuedTurn>) {
    this.set(this.items.map((t) => (t.id === id ? { ...t, ...p } : t)));
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const next = this.items.find((t) => t.status !== "done");
        if (!next || next.status === "failed") break; // a failure blocks until retried, so order is kept
        this.sent.add(next.id);
        this.patch(next.id, { status: "sending" });
        const ctl = new AbortController();
        const timedOut = new Promise<never>((_, reject) => ctl.signal.addEventListener("abort", () => reject(new Error("La respuesta ha tardado demasiado."))));
        const slow = setTimeout(() => this.patch(next.id, { slow: true }), this.timing.slowMs);
        const kill = setTimeout(() => ctl.abort(), this.timing.timeoutMs);
        try {
          // Race the abort too: a send that ignores the signal still cannot hold the queue.
          const res = await Promise.race([this.send({ text: next.text, source: next.source, ...(next.step === undefined ? {} : { step: next.step }) }, ctl.signal), timedOut]);
          this.patch(next.id, { status: "done", slow: false, segmentId: res.segmentId });
          this.events.result(res, { ...next, status: "done", slow: false, segmentId: res.segmentId });
        } catch (e) {
          this.patch(next.id, { status: "failed", slow: false, error: e instanceof Error ? e.message : String(e) });
        } finally {
          clearTimeout(slow);
          clearTimeout(kill);
        }
      }
    } finally {
      this.running = false;
      this.notify();
    }
  }
}
