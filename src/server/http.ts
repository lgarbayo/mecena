/** Route-handler helpers (scaffold-owned): consistent JSON errors for every API route. */
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
  TooManyRequestsError,
  UnauthorizedError,
} from "@/contracts";
import type { ApiError } from "@/contracts/api";
import { AiBudgetError, AiError } from "@/server/ai/llm";

/** What the user sees for failures whose detail is technical (and in English): the detail goes to the server log only. */
export const ERROR_MESSAGES = {
  badRequest: "Revisa los datos e inténtalo de nuevo.",
  tooLarge: "El archivo es demasiado grande.",
  ai: "La IA no ha respondido. Prueba otra vez en unos segundos.",
  internal: "Algo ha fallado. Prueba otra vez.",
} as const;

const fail = (error: ApiError["error"], message: string, status: number) => NextResponse.json<ApiError>({ error, message }, { status });

export function errorResponse(e: unknown): NextResponse<ApiError> {
  // Our own errors carry Spanish, user-facing messages: pass them through.
  if (e instanceof BadRequestError) return fail("bad_request", e.message, e.status);
  if (e instanceof UnauthorizedError) return fail("unauthorized", e.message, 401);
  if (e instanceof ForbiddenError) return fail("forbidden", e.message, 403);
  if (e instanceof ConflictError) return fail("conflict", e.message, 409);
  if (e instanceof TooManyRequestsError) return fail("too_many_requests", e.message, 429);
  if (e instanceof PaymentRequiredError) return fail("payment_required", e.message, 402);
  if (e instanceof NotFoundError) return fail("not_found", e.message, 404);
  if (e instanceof AiBudgetError) return fail("too_many_requests", e.message, 429);
  // Technical detail (zod issues, SDK errors, stack traces) stays in the server log.
  console.error(e);
  if (e instanceof ZodError) return fail("bad_request", ERROR_MESSAGES.badRequest, 400); // internal validation, not the request body
  if (e instanceof AiError) return fail("ai_failed", ERROR_MESSAGES.ai, 502);
  return fail("internal", ERROR_MESSAGES.internal, 500);
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

/** Default ceiling for a JSON body. Routes that take files raise it (photos, imported dossiers). */
export const MAX_JSON_BYTES = 1024 * 1024;
/**
 * Next's proxy (src/proxy.ts) buffers at most this much of a request body and silently drops the rest
 * (experimental.proxyClientMaxBodySize in next.config.ts: keep the two in sync).
 */
export const PROXY_BODY_LIMIT_BYTES = 30 * 1024 * 1024;

/**
 * The JSON body of an API request, or {} when it has none.
 *
 * CSRF guard for every JSON route (login and sign-up need no cookie, so SameSite cannot protect them): a cross-site
 * page can only POST without a CORS preflight as a form (urlencoded, multipart, text/plain), never as
 * application/json, and browsers mark such requests Sec-Fetch-Site: cross-site. So a non-empty body must be sent as
 * application/json, and a browser request from another site is refused (403) before anything is read.
 *
 * Size: a body over `maxBytes` is refused (413, «El archivo es demasiado grande»), by its Content-Length before reading
 * when the client sends one. A body cut by the proxy limit arrives as truncated JSON: that is the same 413, and any other
 * unparseable body is a 400.
 */
export async function readJson(req: Request, opts: { maxBytes?: number } = {}): Promise<unknown> {
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new ForbiddenError("Petición desde otro sitio no permitida.");
  const maxBytes = opts.maxBytes ?? MAX_JSON_BYTES;
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BadRequestError(ERROR_MESSAGES.tooLarge, 413);
  const text = await req.text().catch(() => "");
  if (!text.trim()) return {};
  if (!isJson(req.headers.get("content-type"))) throw new ForbiddenError("El cuerpo de la petición debe enviarse como application/json.");
  const bytes = Buffer.byteLength(text);
  if (bytes > maxBytes) throw new BadRequestError(ERROR_MESSAGES.tooLarge, 413);
  try {
    return JSON.parse(text);
  } catch {
    // The proxy keeps only the first PROXY_BODY_LIMIT_BYTES of a body: what is left is JSON cut in the middle.
    if (bytes >= PROXY_BODY_LIMIT_BYTES || (Number.isFinite(declared) && declared > bytes)) throw new BadRequestError(ERROR_MESSAGES.tooLarge, 413);
    throw new BadRequestError(ERROR_MESSAGES.badRequest);
  }
}

/** Per-parse message for every issue whose schema has no message of its own (lower precedence than schema messages). */
const GENERIC_ISSUE = "__mecena_generic__";

/**
 * The request body validated by `schema`. Schema messages written for users (Spanish, e.g. "Escribe un email válido")
 * are shown as they are; zod's own technical ones (English) become ERROR_MESSAGES.badRequest.
 */
export async function body<S extends z.ZodType>(req: Request, schema: S, opts: { maxBytes?: number } = {}): Promise<z.infer<S>> {
  const raw = await readJson(req, opts);
  const parsed = schema.safeParse(raw, { error: () => GENERIC_ISSUE });
  if (parsed.success) return parsed.data;
  const own = parsed.error.issues.map((i) => i.message).find((m) => m !== GENERIC_ISSUE);
  console.warn("[http] invalid request body:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.code}`).join("; "));
  throw new BadRequestError(own ?? ERROR_MESSAGES.badRequest);
}

export const json = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);
