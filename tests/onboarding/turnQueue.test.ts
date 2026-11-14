import { describe, expect, it } from "vitest";
import type { OnboardingTurnResponse } from "@/contracts/api";
import { TURN_SLOW_MS, TURN_TIMEOUT_MS, TurnQueue, type QueuedTurn } from "@/features/onboarding/turnQueue";

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

  it("finals that arrive while a turn is in flight become ONE next turn with all the text", async () => {
    const gates: (() => void)[] = [];
    const sent: string[] = [];
    const results: QueuedTurn[] = [];
    const q = new TurnQueue(
      (t) => {
        sent.push(t.text);
        return new Promise((r) => gates.push(() => r(res(`seg-${sent.length}`))));
      },
      { change() {}, result: (_r, t) => results.push(t) },
    );
    const first = q.enqueue("uno", "voice", 2)!;
    const second = q.enqueue("dos", "voice", 2)!;
    const third = q.enqueue(" tres ", "voice", 2)!;
    expect(third.id).toBe(second.id); // merged into the queued turn and returned
    expect(q.snapshot.map((t) => [t.text, t.status])).toEqual([
      ["uno", "sending"],
      ["dos tres", "queued"],
    ]);
    gates.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    expect(q.snapshot[1].status).toBe("sending");
    q.enqueue("cuatro", "voice", 2); // the merged turn is sending now: a new turn
    gates.shift()!();
    await new Promise((r) => setTimeout(r, 0));
    gates.shift()!();
    await q.idle();
    expect(sent).toEqual(["uno", "dos tres", "cuatro"]);
    expect(results.map((t) => [t.text, t.step])).toEqual([
      ["uno", 2],
      ["dos tres", 2],
      ["cuatro", 2],
    ]);
    expect(first.step).toBe(2);
  });

  it("never merges across source or step, nor into a failed turn", async () => {
    let fail = true;
    let release!: () => void;
    const sent: string[] = [];
    const q = new TurnQueue(
      async (t) => {
        if (t.text === "a") await new Promise<void>((r) => (release = r));
        if (fail && t.text === "e") throw new Error("boom");
        sent.push(t.text);
        return res(t.text);
      },
      { change() {}, result() {} },
    );
    q.enqueue("a", "voice", 1); // in flight
    q.enqueue("b", "voice", 1);
    q.enqueue("c", "text", 1); // other source
    q.enqueue("d", "text", 2); // other step
    q.enqueue("d2", "text", 2); // merges with d
    q.enqueue("e", "voice"); // no step vs step 2
    expect(q.snapshot.map((t) => t.text)).toEqual(["a", "b", "c", "d d2", "e"]);
    release();
    await q.idle();
    expect(q.hasFailed).toBe(true);
    const failed = q.snapshot.at(-1)!;
    expect(failed).toMatchObject({ text: "e", status: "failed" });
    q.enqueue("f", "voice"); // the last turn failed: a new turn behind it
    expect(q.snapshot.map((t) => [t.text, t.status]).slice(-2)).toEqual([
      ["e", "failed"],
      ["f", "queued"],
    ]);
    q.enqueue("g", "voice"); // ...which can take more text, it was never sent
    expect(q.snapshot.at(-1)!.text).toBe("f g");
    fail = false;
    q.retry(failed.id);
    await q.idle();
    expect(sent).toEqual(["a", "b", "c", "d d2", "e", "f g"]);
  });

  it("a retried turn keeps its exact text (the server reuses its stored segment)", async () => {
    let calls = 0;
    const sent: string[] = [];
    let hold: (() => void) | undefined;
    const q = new TurnQueue(
      async (t) => {
        sent.push(t.text);
        if (calls++ === 0) throw new Error("boom");
        if (calls === 2) await new Promise<void>((r) => (hold = r));
        return res(t.text);
      },
      { change() {}, result() {} },
    );
    const a = q.enqueue("hola", "voice")!;
    await q.idle();
    q.retry(a.id);
    q.enqueue("más", "voice"); // the retried turn is sending: a new turn
    hold?.();
    await q.idle();
    expect(sent).toEqual(["hola", "hola", "más"]);
  });

  it("busy, hasFailed and idle()", async () => {
    let fail = true;
    let release!: () => void;
    const q = new TurnQueue(
      async (t) => {
        if (t.text === "lento") await new Promise<void>((r) => (release = r));
        if (fail && t.text === "malo") throw new Error("boom");
        return res(t.text);
      },
      { change() {}, result() {} },
    );
    expect(q.busy).toBe(false);
    await q.idle(); // idle already: resolves at once
    q.enqueue("lento", "voice");
    expect(q.busy).toBe(true);
    let idle = false;
    const waiting = q.idle().then(() => (idle = true));
    await new Promise((r) => setTimeout(r, 0));
    expect(idle).toBe(false);
    release();
    await waiting;
    expect(q.busy).toBe(false);
    expect(q.hasFailed).toBe(false);

    const bad = q.enqueue("malo", "text")!;
    q.enqueue("detrás", "voice");
    await q.idle(); // resolves although "detrás" is still queued: the failed turn blocks it
    expect(q.hasFailed).toBe(true);
    expect(q.busy).toBe(true);
    expect(q.snapshot.at(-1)!.status).toBe("queued");
    fail = false;
    q.retry(bad.id);
    await q.idle();
    expect(q.hasFailed).toBe(false);
    expect(q.busy).toBe(false);
  });

  it("timeouts match the bounded server turn (45 s deadline + margin) and the slow flag stays well below", () => {
    expect(TURN_TIMEOUT_MS).toBe(60_000);
    expect(TURN_TIMEOUT_MS).toBeGreaterThan(45_000);
    expect(TURN_SLOW_MS).toBe(8_000);
  });
});
