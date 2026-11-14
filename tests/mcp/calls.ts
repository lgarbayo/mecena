/** Test calls for the tools' paywall/status/router tests: clones of the fixture beca the demo creator is eligible for. */
import fs from "node:fs";
import path from "node:path";
import type { Call } from "@/contracts";
import { fixtureCalls } from "@/fixtures";

const base = fixtureCalls.find((c) => c.id === "fixture-beca-artes-plasticas")!;

export function testCall(id: string, over: Partial<Call> = {}): Call {
  return { ...structuredClone(base), id, title: id, ...over };
}

/** Replaces the calls the store reads (tests/setup.ts points MECENA_CALLS_DIR at a temp dir per test). */
export function writeCalls(calls: Call[]): void {
  fs.writeFileSync(path.join(process.env.MECENA_CALLS_DIR!, "calls.json"), JSON.stringify(calls));
}

/** Six open calls, one upcoming and one recurring whose 2026 edition already closed. */
export function paywallCalls(): Call[] {
  const open = ["alfa", "bravo", "charlie", "delta", "echo", "foxtrot"].map((w, i) =>
    testCall(`open-${w}`, { title: `Beca ${w} de artes plásticas`, deadline: `2026-12-${String(10 + i).padStart(2, "0")}`, deadlineText: `${10 + i} de diciembre de 2026` }),
  );
  return [
    ...open,
    testCall("upcoming-golf", { title: "Beca golf de artes plásticas", status: "upcoming", opensAt: "2027-04-16", deadline: "2027-05-16", deadlineText: "16 de mayo de 2027" }),
    testCall("xuventude-crea-2026", {
      title: "Premios Xuventude Crea de artes plásticas",
      status: "recurring",
      deadline: null,
      deadlineText: "Se convoca cada año; la edición 2026 ya cerró (plazo hasta el 30 de junio).",
    }),
  ];
}
