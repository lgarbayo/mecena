import { describe, expect, it } from "vitest";
import type { OnboardingTurnResponse } from "@/contracts/api";
import { TurnQueue, type QueuedTurn } from "@/features/onboarding/turnQueue";

const res = (segmentId: string) => ({ segmentId }) as unknown as OnboardingTurnResponse;

describe("TurnQueue", () => {
  it("sends quick chunks strictly one after another, in order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const sent: string[] = [];
    const q = new TurnQueue(
      async (t) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        sent.push(t.text);
        inFlight--;
        return res(`seg-${sent.length}`);
      },
      { change() {}, result() {} },
    );
    q.enqueue("uno", "voice");
    q.enqueue("dos", "voice");
    q.enqueue("  ", "voice"); // ignored
    q.enqueue("tres", "text");
    await q.drain();
    expect(sent).toEqual(["uno", "dos", "tres"]);
    expect(maxInFlight).toBe(1);
    expect(q.snapshot.map((t) => t.status)).toEqual(["done", "done", "done"]);
  });

  it("a failure keeps the text, blocks later turns and resumes on retry", async () => {
    let fail = true;
    const sent: string[] = [];
    const results: QueuedTurn[] = [];
    const q = new TurnQueue(
      async (t) => {
        if (fail && t.text === "uno") throw new Error("boom");
        sent.push(t.text);
        return res(`seg-${t.text}`);
      },
      { change() {}, result: (_r, t) => results.push(t) },
    );
    const first = q.enqueue("uno", "voice")!;
    q.enqueue("dos", "voice");
    await q.drain();
    expect(q.snapshot.map((t) => [t.text, t.status])).toEqual([
      ["uno", "failed"],
      ["dos", "queued"],
    ]);
    expect(sent).toEqual([]);
    fail = false;
    q.retry(first.id);
    await q.drain();
    expect(sent).toEqual(["uno", "dos"]);
    expect(results.map((t) => t.segmentId)).toEqual(["seg-uno", "seg-dos"]);
  });

  it("a turn that never answers is flagged slow, then aborted and failed, and the queue resumes on retry", async () => {
    let hang = true;
    const signals: AbortSignal[] = [];
    const sent: string[] = [];
    const q = new TurnQueue(
      (t, signal) => {
        signals.push(signal);
        if (hang) return new Promise(() => undefined); // the request never comes back
        sent.push(t.text);
        return Promise.resolve(res(`seg-${t.text}`));
      },
      { change() {}, result() {} },
      { timeoutMs: 60, slowMs: 20 },
    );
    const first = q.enqueue("uno", "voice")!;
    q.enqueue("dos", "voice");
    await new Promise((r) => setTimeout(r, 35));
    expect(q.snapshot[0]).toMatchObject({ status: "sending", slow: true });
    await q.drain();
    expect(q.snapshot.map((t) => [t.text, t.status])).toEqual([
      ["uno", "failed"],
      ["dos", "queued"],
    ]);
    expect(signals[0].aborted).toBe(true);
    hang = false;
    q.retry(first.id);
    await q.drain();
    expect(sent).toEqual(["uno", "dos"]);
    expect(q.snapshot.map((t) => [t.status, t.slow])).toEqual([
      ["done", false],
      ["done", false],
    ]);
  });
});
