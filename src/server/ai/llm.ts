/**
 * Thin Claude helper (scaffold-owned). Feature ai.ts files call `structured()` for JSON results
 * validated by a zod schema. Do not import @anthropic-ai/sdk elsewhere except the in-app agent (WP-04).
 *
 * - fast  = MECENA_MODEL_FAST  (default claude-sonnet-5-5), effort "low"  -> onboarding turns, fit explanations, vision
 * - smart = MECENA_MODEL_SMART (default claude-opus-5-5),   effort "high" -> drafting, jury, revisions
 * Server-side refusal fallbacks are enabled ("default" routing) via the server-side-fallback beta.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { serverEnv, type ModelTier } from "@/contracts";

let client: Anthropic | undefined;
export function anthropic(): Anthropic {
  const env = serverEnv();
  if (!env.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not set (mock mode should have been used)");
  client ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export function isMockAi(): boolean {
  return serverEnv().aiMock;
}

export function modelFor(tier: ModelTier): string {
  const env = serverEnv();
  return tier === "fast" ? env.modelFast : env.modelSmart;
}

export class AiError extends Error {
  constructor(message: string, readonly reason: "refusal" | "parse" | "api") {
    super(message);
    this.name = "AiError";
  }
}

export type UserContent = Anthropic.Beta.Messages.BetaContentBlockParam[] | string;

export interface StructuredRequest<S extends z.ZodType> {
  tier: ModelTier;
  system: string;
  user: UserContent;
  schema: S;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

/** One Claude call that returns a schema-validated object. Throws AiError on refusal / unparseable output. */
export async function structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  const res = await anthropic()
    .beta.messages.parse({
      model: modelFor(req.tier),
      max_tokens: req.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      output_config: {
        format: betaZodOutputFormat(req.schema),
        effort: req.effort ?? (req.tier === "fast" ? "low" : "high"),
      },
    })
    .catch((e: unknown) => {
      throw new AiError(e instanceof Error ? e.message : String(e), "api");
    });
  if (res.stop_reason === "refusal") throw new AiError("Claude declined the request", "refusal");
  if (res.parsed_output == null) throw new AiError(`Unparseable output (stop_reason=${res.stop_reason})`, "parse");
  return res.parsed_output as z.infer<S>;
}

/** Image content block helper for vision calls. */
export function imageBlock(base64: string, mediaType: "image/jpeg" | "image/png" | "image/webp"): Anthropic.Beta.Messages.BetaImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
}
