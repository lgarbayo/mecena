/**
 * Thin Claude helper (scaffold-owned). Feature ai.ts files call `structured()` for JSON results
 * validated by a zod schema. Do not import @anthropic-ai/sdk elsewhere except the in-app agent (WP-04).
 *
 * - fast  = MECENA_MODEL_FAST  (default claude-sonnet-5-5), effort "low"  -> onboarding turns, fit explanations, vision
 * - smart = MECENA_MODEL_SMART (default claude-opus-5-5),   effort "high" -> drafting, jury, revisions
 * Server-side refusal fallbacks are enabled ("default" routing) via the server-side-fallback beta, except on Haiku models,
 * which have no server-side fallback (a fallback list there is a 400; "default" is a no-op).
 * A request can override the tier's model and pass SDK per-request options (timeout, retries) plus a hard deadline.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { serverEnv, type ModelTier } from "@/contracts";
import { tryChargeAiCall } from "./budget";
import { currentAiSwitches } from "@/features/demo/ai-mode";

let client: Anthropic | undefined;
export function anthropic(): Anthropic {
  const env = serverEnv();
  if (!env.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not set (mock mode should have been used)");
  client ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/** Mocks when the server has no key (or MECENA_AI_MOCK=1), or when this request's account switched "IA simulada" on in /demo. */
export function isMockAi(): boolean {
  return serverEnv().aiMock || currentAiSwitches().aiMock;
}

export function modelFor(tier: ModelTier): string {
  const env = serverEnv();
  return tier === "fast" ? env.modelFast : env.modelSmart;
}

export class AiError extends Error {
  constructor(message: string, readonly reason: "refusal" | "parse" | "api" | "budget") {
    super(message);
    this.name = "AiError";
  }
}

/**
 * Today's global ceiling of Claude requests is used up (src/server/ai/budget.ts). An AiError, so features that fall
 * back to their deterministic version on AI failure (onboarding, works) keep working; routes answer 429.
 */
export class AiBudgetError extends AiError {
  constructor() {
    super("Mecena ha llegado hoy a su límite de uso de la IA. Vuelve a probar mañana.", "budget");
    this.name = "AiBudgetError";
  }
}

/** Call right before every request to the Anthropic API: counts it against the global daily ceiling. */
export function chargeAiCall(): void {
  if (!tryChargeAiCall()) throw new AiBudgetError();
}

export type UserContent = Anthropic.Beta.Messages.BetaContentBlockParam[] | string;

export interface StructuredRequest<S extends z.ZodType> {
  tier: ModelTier;
  system: string;
  user: UserContent;
  schema: S;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Overrides the tier's model (e.g. MECENA_MODEL_ONBOARDING). */
  model?: string;
  /** Per-attempt HTTP timeout in ms (SDK per-request option). Omitted: the client default (10 min). */
  timeoutMs?: number;
  /** SDK retries (408/409/429/5xx, connection errors, timeouts). Omitted: the client default (2). */
  maxRetries?: number;
  /**
   * Hard wall-clock cap in ms for the whole call, retries included. The SDK honours any retry-after a 429 sends, with
   * no upper bound, so timeoutMs x (maxRetries + 1) alone does not bound the wait. On expiry the call fails as AiError("api").
   */
  deadlineMs?: number;
  /** Called with the token usage of the response (cost measurements); never required. */
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
  /** "disabled" turns thinking off (only for models that accept it: Haiku 5.5 at effort <= high); "adaptive" switches reasoning on explicitly; omitted: model default. */
  thinking?: "disabled" | "adaptive";
}

/** Haiku models have no server-side refusal fallback: never send `fallbacks` to them. */
export function supportsServerFallback(model: string): boolean {
  return !/haiku/i.test(model);
}

/** One Claude call that returns a schema-validated object. Throws AiError on refusal / unparseable output. */
export async function structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  chargeAiCall();
  const model = req.model ?? modelFor(req.tier);
  const options: { timeout?: number; maxRetries?: number; signal?: AbortSignal } = {};
  if (req.timeoutMs !== undefined) options.timeout = req.timeoutMs;
  if (req.maxRetries !== undefined) options.maxRetries = req.maxRetries;
  if (req.deadlineMs !== undefined) options.signal = AbortSignal.timeout(req.deadlineMs);
  const res = await anthropic()
    .beta.messages.parse(
      {
        model,
        max_tokens: req.maxTokens ?? 16000,
        ...(supportsServerFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        ...(req.thinking ? { thinking: { type: req.thinking } } : {}),
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        output_config: {
          format: betaZodOutputFormat(req.schema),
          effort: req.effort ?? (req.tier === "fast" ? "low" : "high"),
        },
      },
      Object.keys(options).length ? options : undefined, // other callers: exactly the previous single-argument call
    )
    .catch((e: unknown) => {
      throw new AiError(e instanceof Error ? e.message : String(e), "api");
    });
  if (req.onUsage && res.usage) req.onUsage({ inputTokens: res.usage.input_tokens ?? 0, outputTokens: res.usage.output_tokens ?? 0 });
  if (res.stop_reason === "refusal") throw new AiError("Claude declined the request", "refusal");
  if (res.parsed_output == null) throw new AiError(`Unparseable output (stop_reason=${res.stop_reason})`, "parse");
  return res.parsed_output as z.infer<S>;
}

/** Image content block helper for vision calls. */
export function imageBlock(base64: string, mediaType: "image/jpeg" | "image/png" | "image/webp"): Anthropic.Beta.Messages.BetaImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
}
