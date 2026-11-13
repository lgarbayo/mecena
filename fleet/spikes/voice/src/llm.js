// Real Claude client for the spike (@anthropic-ai/sdk). Same interface as createMockLLM().

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { patchSchema, dossierSchema, SHEET_SCHEMA, IMAGE_NOTES_SCHEMA, FIT_SCHEMA, variantSchema } from "./schemas.js";
import { extractorSystem, dossierSystem, SHEET_SYSTEM, IMAGE_NOTES_SYSTEM, FIT_SYSTEM, variantSystem } from "./prompts.js";
import { stateForPrompt } from "./profile.js";

export const MODELS = {
  extract: process.env.EXTRACT_MODEL || "claude-sonnet-5-5",
  dossier: process.env.DOSSIER_MODEL || "claude-sonnet-5-5",
  sheet: process.env.SHEET_MODEL || "claude-sonnet-5-5",
  fit: process.env.FIT_MODEL || "claude-sonnet-5-5",
  variant: process.env.VARIANT_MODEL || "claude-sonnet-5-5",
};

/**
 * Find ANTHROPIC_API_KEY: process env first, then a .env at the repo root
 * (this worktree's root and the main checkout's root). Never logs the key.
 */
export function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, from: "environment" };
  const roots = new Set();
  try {
    roots.add(execSync("git rev-parse --show-toplevel", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim());
    const common = execSync("git rev-parse --path-format=absolute --git-common-dir", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    roots.add(path.dirname(common));
  } catch {
    /* not a git checkout */
  }
  for (const root of roots) {
    const file = path.join(root, ".env");
    if (!fs.existsSync(file)) continue;
    const m = fs.readFileSync(file, "utf8").match(/^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*["']?([^"'\s#]+)/m);
    if (m) return { key: m[1], from: file };
  }
  return null;
}

// Fast-path request settings shared by every call:
// - thinking "between_tools" = no extended thinking on claude-sonnet-5-5 (lowest latency);
//   adaptive thinking is used automatically for any other model.
// - effort "low": extraction is not a reasoning-heavy task.
// - structured outputs (output_config.format) guarantee schema-valid JSON.
// - server-side refusal fallback ("default"), as recommended for claude-sonnet-5-5.
function baseParams(model, schema, effort = "low") {
  const params = { model, output_config: { effort, format: { type: "json_schema", schema } } };
  if (model === "claude-sonnet-5-5") params.thinking = { type: "between_tools" };
  else if (model === "claude-haiku-5-5") params.thinking = { type: "disabled" }; // allowed at effort <= high
  else params.thinking = { type: "adaptive" };
  // Haiku has no server-side refusal fallback; the session simply retries the words next call.
  if (model !== "claude-haiku-5-5") Object.assign(params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  return params;
}

export function createClaudeLLM(apiKey) {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 });

  /** Streams the request to measure time-to-first-token, returns parsed JSON + timings. */
  async function run(params) {
    const t0 = performance.now();
    let ttft = null;
    const stream = client.beta.messages.stream(params);
    stream.on("text", () => {
      if (ttft === null) ttft = Math.round(performance.now() - t0);
    });
    const msg = await stream.finalMessage();
    const latencyMs = Math.round(performance.now() - t0);
    if (msg.stop_reason === "refusal") throw new Error(`refusal: ${msg.stop_details?.category ?? "unknown"}`);
    if (msg.stop_reason === "max_tokens") throw new Error("max_tokens: output truncated");
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return {
      data: JSON.parse(text),
      latencyMs,
      ttftMs: ttft,
      usage: msg.usage,
      model: msg.model,
    };
  }

  return {
    mock: false,

    /** Fit of one profile with one call. Not real-time: runs once per (profile, call) after onboarding. */
    async fit({ profile, call }) {
      const r = await run({
        ...baseParams(MODELS.fit, FIT_SCHEMA, "medium"),
        max_tokens: 8192,
        system: [{ type: "text", text: FIT_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `CALL:\n${JSON.stringify(callForPrompt(call))}\n\nPROFILE:\n${JSON.stringify(profile)}` }],
      });
      return { fit: r.data, latencyMs: r.latencyMs, ttftMs: r.ttftMs, usage: r.usage };
    },

    /** Call-specific dossier variant built from the base dossier + fit. */
    async variant({ mode, profile, dossier, call, fit }) {
      const base = Object.fromEntries(Object.entries(dossier).map(([k, s]) => [k, s.body]));
      const r = await run({
        ...baseParams(MODELS.variant, variantSchema(mode), "medium"),
        max_tokens: 16000,
        system: [{ type: "text", text: variantSystem(mode), cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `CALL:\n${JSON.stringify(callForPrompt(call))}\n\nFIT:\n${JSON.stringify(fit)}\n\nPROFILE:\n${JSON.stringify(profile)}\n\nBASE_DOSSIER:\n${JSON.stringify(base)}`,
          },
        ],
      });
      return { variant: r.data, latencyMs: r.latencyMs, ttftMs: r.ttftMs, usage: r.usage };
    },

    async extract({ mode, transcript, newFrom, state }) {
      const before = transcript.slice(0, newFrom).trim();
      const after = transcript.slice(newFrom).trim();
      const user = `CURRENT_STATE:\n${JSON.stringify(stateForPrompt(state))}\n\nTRANSCRIPT:\n${before} ⟦NEW⟧ ${after}`;
      const r = await run({
        ...baseParams(MODELS.extract, patchSchema(mode)),
        max_tokens: 4096,
        system: [{ type: "text", text: extractorSystem(mode), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      });
      return { ops: r.data.ops, ask_next: r.data.ask_next, latencyMs: r.latencyMs, ttftMs: r.ttftMs, usage: r.usage };
    },

    async dossier({ mode, state, sections, previous }) {
      const prev = Object.fromEntries(sections.filter((s) => previous?.[s]?.body).map((s) => [s, previous[s].body]));
      const user =
        `PROFILE:\n${JSON.stringify(stateForPrompt(state))}\n\n` +
        (Object.keys(prev).length ? `PREVIOUS_TEXT (keep its wording where still accurate; change only what the new facts require):\n${JSON.stringify(prev)}\n\n` : "") +
        `WRITE: ${sections.join(", ")}`;
      const r = await run({
        ...baseParams(MODELS.dossier, dossierSchema(mode)),
        max_tokens: 8192,
        system: [{ type: "text", text: dossierSystem(mode), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      });
      return { sections: r.data.sections, latencyMs: r.latencyMs, ttftMs: r.ttftMs, usage: r.usage };
    },

    async imageNotes({ imagePath }) {
      const ext = path.extname(imagePath).slice(1).toLowerCase().replace("jpg", "jpeg");
      const r = await run({
        ...baseParams(MODELS.sheet, IMAGE_NOTES_SCHEMA),
        max_tokens: 2048,
        system: IMAGE_NOTES_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: `image/${ext}`, data: fs.readFileSync(imagePath).toString("base64") } },
              { type: "text", text: "Describe esta foto de una obra." },
            ],
          },
        ],
      });
      return { notes: r.data, latencyMs: r.latencyMs, ttftMs: r.ttftMs, usage: r.usage };
    },

    async sheet({ transcript, imageNotes }) {
      const user = `SPOKEN_DESCRIPTION:\n${transcript}\n\nIMAGE_NOTES:\n${imageNotes ? JSON.stringify(imageNotes) : "(no photo)"}`;
      const r = await run({
        ...baseParams(MODELS.sheet, SHEET_SCHEMA),
        max_tokens: 4096,
        system: SHEET_SYSTEM,
        messages: [{ role: "user", content: user }],
      });
      return { sheet: r.data, latencyMs: r.latencyMs, ttftMs: r.ttftMs, usage: r.usage };
    },
  };
}

/** The call as the model sees it (drops ids of sources, keeps rules). */
export function callForPrompt(call) {
  const { sources, ...rest } = call;
  return rest;
}
