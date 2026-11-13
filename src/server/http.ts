/** Route-handler helpers (scaffold-owned): consistent JSON errors for every API route. */
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { NotFoundError, PaymentRequiredError } from "@/contracts";
import type { ApiError } from "@/contracts/api";
import { AiError } from "@/server/ai/llm";

export function errorResponse(e: unknown): NextResponse<ApiError> {
  if (e instanceof ZodError) return NextResponse.json({ error: "bad_request", message: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
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

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  return schema.parse(await req.json().catch(() => ({})));
}

export const json = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);
