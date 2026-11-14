// Owned by WP-08. Browser helpers for the jury: NDJSON scoring with per-judge progress and Spanish error texts.
import { API, type Application, type JuryScore } from "@/contracts";
import { ApiClientError, IDEMPOTENCY_HEADER, newIdempotencyKey, redirectToLogin } from "@/lib/api-client";
import type { JuryStreamEvent } from "../stream";

/** Spanish text for any failure (never the raw English message of the AI or the server). */
export function errorText(e: unknown, fallback: string): string {
  if (e instanceof ApiClientError) {
    if (e.status === 502) return fallback;
    if (e.status === 400 || e.status === 402 || e.status === 404 || e.status === 409 || e.status === 429) return e.message;
    if (e.code === "network") return "Sin conexión. Comprueba la red e inténtalo de nuevo.";
  }
  return fallback;
}

/**
 * POST /api/jury asking for an NDJSON stream: calls onJudge as each judge finishes and resolves with the full score.
 * Falls back to a plain JSON body when the response is not a stream. Always sends an Idempotency-Key (pass the same
 * key to retry the same scoring safely).
 */
export async function scoreWithProgress(
  body: { applicationId: string; force?: boolean },
  onJudge: (e: { judgeId: string; name: string; total: number }) => void,
  idempotencyKey: string = newIdempotencyKey(),
): Promise<{ score: JuryScore; application: Application }> {
  let res: Response;
  try {
    res = await fetch(API.jury, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson", [IDEMPOTENCY_HEADER]: idempotencyKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError(0, "network", "Sin conexión");
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (res.status === 401) redirectToLogin();
    throw new ApiClientError(res.status, (err?.error as ApiClientError["code"]) ?? "internal", err?.message ?? `Error ${res.status}`);
  }
  if (!(res.headers.get("content-type") ?? "").includes("ndjson")) return (await res.json()) as { score: JuryScore; application: Application };

  let done: { score: JuryScore; application: Application } | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const e = JSON.parse(line) as JuryStreamEvent;
    if (e.type === "judge") onJudge(e);
    else if (e.type === "done") done = { score: e.score, application: e.application };
    else throw new ApiClientError(e.status, e.status === 502 ? "ai_failed" : "internal", e.message);
  };
  const reader = res.body?.getReader();
  if (!reader) (await res.text()).split("\n").forEach(handle);
  else {
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done: end } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      lines.forEach(handle);
      if (end) break;
    }
    handle(buf);
  }
  if (!done) throw new ApiClientError(502, "ai_failed", "Respuesta incompleta del tribunal");
  return done;
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));
const similar = (a: string, b: string) => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  const common = [...A].filter((w) => B.has(w)).length;
  return common / Math.min(A.size, B.size) >= 0.5;
};

export type Change = { title: string; kind: "added" | "removed" | "modified"; text: string; before?: string };

/** Paragraph diff between two versions of a draft: added, removed and modified (a removed + added pair that look alike). */
export function changes(before: Pick<Application, "sections">, after: Pick<Application, "sections">): Change[] {
  const out: Change[] = [];
  const keys = [...new Set([...before.sections.map((s) => s.key), ...after.sections.map((s) => s.key)])];
  for (const key of keys) {
    const b = before.sections.find((s) => s.key === key);
    const a = after.sections.find((s) => s.key === key);
    const title = a?.title ?? b?.title ?? key;
    const paras = (body = "") => body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const oldP = paras(b?.body);
    const newP = paras(a?.body);
    const removed = oldP.filter((p) => !newP.includes(p));
    const added = newP.filter((p) => !oldP.includes(p));
    for (const text of added) {
      const i = removed.findIndex((r) => similar(r, text));
      if (i >= 0) out.push({ title, kind: "modified", text, before: removed.splice(i, 1)[0] });
      else out.push({ title, kind: "added", text });
    }
    for (const text of removed) out.push({ title, kind: "removed", text });
  }
  return out;
}
