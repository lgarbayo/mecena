/**
 * Client-side turn queue: chunks are POSTed strictly one after another (two quick final chunks never race),
 * and a failed turn blocks the queue (keeps order) until the user retries it. The text is never lost.
 * A turn that takes long is flagged `slow` (say so in the UI) and one that never answers is aborted after
 * TURN_TIMEOUT_MS and becomes `failed`, so a hung request can never freeze the queue (a retry is safe: the
 * server reuses the stored segment of a repeated chunk).
 */
import type { OnboardingTurnResponse } from "@/contracts/api";

export type TurnStatus = "queued" | "sending" | "done" | "failed";
export interface QueuedTurn {
  id: string;
  text: string;
  source: "voice" | "text";
  status: TurnStatus;
  segmentId?: string;
  error?: string;
  /** Still sending after TURN_SLOW_MS. */
  slow?: boolean;
}

export type SendTurn = (turn: { text: string; source: "voice" | "text" }, signal: AbortSignal) => Promise<OnboardingTurnResponse>;

/** Above the slowest turn measured on the server (~112 s, a business turn falling back to the mock). */
export const TURN_TIMEOUT_MS = 150_000;
export const TURN_SLOW_MS = 12_000;

export interface TurnQueueEvents {
  change(items: QueuedTurn[]): void;
  result(res: OnboardingTurnResponse, turn: QueuedTurn): void;
}

let seq = 0;

export class TurnQueue {
  private items: QueuedTurn[] = [];
  private running = false;

  constructor(
    private readonly send: SendTurn,
    private readonly events: TurnQueueEvents,
    private readonly timing = { timeoutMs: TURN_TIMEOUT_MS, slowMs: TURN_SLOW_MS },
  ) {}

  get snapshot(): QueuedTurn[] {
    return this.items;
  }

  enqueue(text: string, source: "voice" | "text"): QueuedTurn | undefined {
    const clean = text.trim();
    if (!clean) return undefined;
    const turn: QueuedTurn = { id: `local-${++seq}`, text: clean, source, status: "queued" };
    this.set([...this.items, turn]);
    void this.pump();
    return turn;
  }

  retry(id: string) {
    this.patch(id, { status: "queued", error: undefined });
    void this.pump();
  }

  /** Resolves when the queue is idle (tests). */
  async drain(): Promise<void> {
    while (this.running) await new Promise((r) => setTimeout(r, 0));
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
        this.patch(next.id, { status: "sending" });
        const ctl = new AbortController();
        const timedOut = new Promise<never>((_, reject) => ctl.signal.addEventListener("abort", () => reject(new Error("La respuesta ha tardado demasiado."))));
        const slow = setTimeout(() => this.patch(next.id, { slow: true }), this.timing.slowMs);
        const kill = setTimeout(() => ctl.abort(), this.timing.timeoutMs);
        try {
          // Race the abort too: a send that ignores the signal still cannot hold the queue.
          const res = await Promise.race([this.send({ text: next.text, source: next.source }, ctl.signal), timedOut]);
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
    }
  }
}
