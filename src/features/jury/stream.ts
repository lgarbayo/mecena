// Owned by WP-08. NDJSON stream for the jury: one line per judge as it finishes, then the full score.
// Lines: {"type":"judge",judgeId,name,total} · {"type":"done",score,application} · {"type":"error",status,message}
import { ConflictError, NotFoundError, PaymentRequiredError, type Application, type JuryScore } from "@/contracts";
import { AiError } from "@/server/ai/llm";
import type { JudgeEvent } from "./service";

export const NDJSON = "application/x-ndjson";

export type JuryStreamEvent =
  | ({ type: "judge" } & JudgeEvent)
  | { type: "done"; score: JuryScore; application: Application; cached?: boolean }
  | { type: "error"; status: number; message: string };

export const wantsStream = (req: Request) => (req.headers.get("accept") ?? "").includes(NDJSON);

/** Spanish message + status for a failure that happens after the stream started (headers already sent). */
export function streamError(e: unknown): { status: number; message: string } {
  if (e instanceof AiError) return { status: 502, message: "El tribunal no ha podido puntuar ahora mismo. Inténtalo de nuevo." };
  if (e instanceof PaymentRequiredError) return { status: 402, message: e.message };
  if (e instanceof ConflictError || e instanceof NotFoundError) return { status: e instanceof ConflictError ? 409 : 404, message: e.message };
  console.error(e);
  return { status: 500, message: "Algo ha fallado al puntuar. Inténtalo de nuevo." };
}

/** Run `work` and stream its judge events and result as NDJSON. */
export function juryStream(work: (emit: (e: JuryStreamEvent) => void) => Promise<JuryStreamEvent>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: JuryStreamEvent) => {
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // client went away: the scoring still finishes and is saved
        }
      };
      try {
        send(await work(send));
      } catch (e) {
        send({ type: "error", ...streamError(e) });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(body, { headers: { "content-type": `${NDJSON}; charset=utf-8`, "cache-control": "no-store", "x-accel-buffering": "no" } });
}
