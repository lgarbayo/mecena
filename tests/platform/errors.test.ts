/** Errors the user sees: Spanish, generic for technical failures (detail only in the log), 404s without ids, body limits. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GET as callDetail } from "@/app/api/calls/[id]/route";
import { POST as importDossier } from "@/app/api/onboarding/import/route";
import { POST as turn } from "@/app/api/onboarding/turn/route";
import { GET as juryGet } from "@/app/api/jury/route";
import { NotFoundError } from "@/contracts";
import { AiBudgetError, AiError } from "@/server/ai/llm";
import { ERROR_MESSAGES, errorResponse, MAX_JSON_BYTES, readJson } from "@/server/http";
import { ctx, loginDemo, req } from "../helpers";

afterEach(() => vi.restoreAllMocks());

const raw = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/x", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

describe("NotFoundError", () => {
  it("one message per kind, with the right gender and no internal id", () => {
    expect(new NotFoundError("call").message).toBe("No encontramos esta convocatoria.");
    expect(new NotFoundError("application").message).toBe("No encontramos esta solicitud.");
    expect(new NotFoundError("profile").message).toBe("No encontramos este perfil.");
    expect(new NotFoundError("work").message).toBe("No encontramos esta obra.");
    expect(new NotFoundError("image").message).toBe("No encontramos esta imagen.");
  });

  it("older labels with an id map to their kind and drop the id", () => {
    expect(new NotFoundError("Convocatoria call-123").message).toBe("No encontramos esta convocatoria.");
    expect(new NotFoundError("Solicitud app-9").message).toBe("No encontramos esta solicitud.");
    expect(new NotFoundError("Cosa rara 42").message).toBe("No encontramos lo que buscas.");
  });

  it("routes answer 404 with that message (unknown call, unknown application)", async () => {
    await loginDemo();
    const res = await callDetail(req("/api/calls/no-existe"), ctx({ id: "no-existe" }));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe("No encontramos esta convocatoria.");
    const jury = await juryGet(req("/api/jury?applicationId=app-secreto-1"));
    expect(jury.status).toBe(404);
    const msg = (await jury.json()).message as string;
    expect(msg).toBe("No encontramos esta solicitud.");
    expect(msg).not.toContain("app-secreto-1");
  });
});

describe("errorResponse", () => {
  it("AI failures: a Spanish 502, the SDK's English detail only in the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = errorResponse(new AiError("529 overloaded_error: Overloaded", "api"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "ai_failed", message: ERROR_MESSAGES.ai });
    expect(log).toHaveBeenCalled();
  });

  it("unexpected errors: a generic Spanish 500, never the raw message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = errorResponse(new Error("ENOENT: /data/db.json secret path"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal", message: "Algo ha fallado. Prueba otra vez." });
  });

  it("an internal validation error is a generic 400", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const e = z.object({ a: z.string() }).safeParse({}).error!;
    const res = errorResponse(e);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("Revisa los datos e inténtalo de nuevo.");
  });

  it("the daily AI ceiling is a 429 with its own message", async () => {
    const res = errorResponse(new AiBudgetError());
    expect(res.status).toBe(429);
    expect((await res.json()).message).toMatch(/límite de uso de la IA/);
  });
});

describe("request bodies", () => {
  it("a schema message written for users is shown as it is, without the ': ' path prefix", async () => {
    await loginDemo();
    const res = await importDossier(req("/api/onboarding/import", { body: { fileName: "x.pdf" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("Sube un archivo o pega el texto de tu dossier");
  });

  it("zod's own (English) messages become the generic Spanish one", async () => {
    await loginDemo();
    const res = await turn(req("/api/onboarding/turn", { body: { text: "hola", source: "telepatía" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("Revisa los datos e inténtalo de nuevo.");
  });

  it("over the size limit: 413 «El archivo es demasiado grande», by Content-Length before reading", async () => {
    await expect(readJson(raw("{}", { "content-length": String(MAX_JSON_BYTES + 1) }))).rejects.toMatchObject({ status: 413, message: "El archivo es demasiado grande." });
    await expect(readJson(raw(JSON.stringify({ t: "x".repeat(2000) })), { maxBytes: 1000 })).rejects.toMatchObject({ status: 413 });
  });

  it("JSON cut short (the proxy keeps only its first bytes) is the same 413, not a confusing validation error", async () => {
    const cut = raw('{"fileDataUrl":"data:application/pdf;base64,JVBERi0xLjQK', { "content-length": "40000000" });
    await expect(readJson(cut, { maxBytes: 50_000_000 })).rejects.toMatchObject({ status: 413, message: "El archivo es demasiado grande." });
  });

  it("malformed JSON is a 400 (it used to be read as {})", async () => {
    await expect(readJson(raw("{nope"))).rejects.toMatchObject({ status: 400, message: "Revisa los datos e inténtalo de nuevo." });
  });

  it("an onboarding chunk over 4000 characters is refused with a Spanish reason", async () => {
    await loginDemo();
    const res = await turn(req("/api/onboarding/turn", { body: { text: "a".repeat(4001), source: "text" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/demasiado largo/);
  });
});
