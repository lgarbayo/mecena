/** Route-handler helpers (scaffold-owned): consistent JSON errors for every API route. */
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { ConflictError, ForbiddenError, NotFoundError, PaymentRequiredError, TooManyRequestsError, UnauthorizedError } from "@/contracts";
import type { ApiError } from "@/contracts/api";
import { AiError } from "@/server/ai/llm";

export function errorResponse(e: unknown): NextResponse<ApiError> {
  if (e instanceof ZodError) return NextResponse.json({ error: "bad_request", message: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  if (e instanceof UnauthorizedError) return NextResponse.json({ error: "unauthorized", message: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: "forbidden", message: e.message }, { status: 403 });
  if (e instanceof ConflictError) return NextResponse.json({ error: "conflict", message: e.message }, { status: 409 });
  if (e instanceof TooManyRequestsError) return NextResponse.json({ error: "too_many_requests", message: e.message }, { status: 429 });
  if (e instanceof PaymentRequiredError) return NextResponse.json({ error: "payment_required", message: e.message }, { status: 402 });
  if (e instanceof NotFoundError) return NextResponse.json({ error: "not_found", message: e.message }, { status: 404 });
  if (e instanceof AiError) return NextResponse.json({ error: "ai_failed", message: e.message }, { status: 502 });
  console.error(e);
  return NextResponse.json({ error: "internal", message: e instanceof Error ? e.message : "Error interno" }, { status: 500 });
}

/** Wrap a handler so thrown errors become ApiError JSON. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

const isJson = (contentType: string | null) => /^application\/([\w.+-]*\+)?json\s*(;|$)/i.test(contentType?.trim() ?? "");

/**
 * The JSON body of an API request, or {} when it has none / is not valid JSON.
 *
 * CSRF guard for every JSON route (login and sign-up need no cookie, so SameSite cannot protect them): a cross-site
 * page can only POST without a CORS preflight as a form (urlencoded, multipart, text/plain), never as
 * application/json, and browsers mark such requests Sec-Fetch-Site: cross-site. So a non-empty body must be sent as
 * application/json, and a browser request from another site is refused (403) before anything is read.
 */
export async function readJson(req: Request): Promise<unknown> {
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new ForbiddenError("Petición desde otro sitio no permitida.");
  const text = await req.text().catch(() => "");
  if (!text.trim()) return {};
  if (!isJson(req.headers.get("content-type"))) throw new ForbiddenError("El cuerpo de la petición debe enviarse como application/json.");
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  return schema.parse(await readJson(req));
}

export const json = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);
