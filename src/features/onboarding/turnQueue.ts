/**
 * Client-side turn queue: chunks are POSTed strictly one after another (two quick final chunks never race),
 * and a failed turn blocks the queue (keeps order) until the user retries it. The text is never lost.
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
}

export type SendTurn = (turn: { text: string; source: "voice" | "text" }) => Promise<OnboardingTurnResponse>;

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
        try {
          const res = await this.send({ text: next.text, source: next.source });
          this.patch(next.id, { status: "done", segmentId: res.segmentId });
          this.events.result(res, { ...next, status: "done", segmentId: res.segmentId });
        } catch (e) {
          this.patch(next.id, { status: "failed", error: e instanceof Error ? e.message : String(e) });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
