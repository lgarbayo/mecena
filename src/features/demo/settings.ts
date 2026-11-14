/**
 * Per-account demo switches (plan B), set from /demo and read on every AI call. Server-only.
 *
 * Stored apart from db.json, in <MECENA_DATA_DIR>/demo-settings.json keyed by User.id, so the Db contract does not
 * change and a demo reset of one account never touches another's switches. Deliberately free of store imports:
 * src/server/ai/llm.ts reads it, and the store must not end up in an import cycle with the AI layer.
 *
 * - deterministicJury: the jury (judge + revise) runs on the deterministic mock for this account: 61 → 84.
 * - aiMock: every AI call made for this account runs on the deterministic mocks (no Anthropic spend, no latency).
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { serverEnv } from "@/contracts";

export const DemoSettings = z.object({
  deterministicJury: z.boolean().default(false),
  aiMock: z.boolean().default(false),
});
export type DemoSettings = z.infer<typeof DemoSettings>;

export const DEFAULT_DEMO_SETTINGS: DemoSettings = Object.freeze({ deterministicJury: false, aiMock: false });

const SettingsFile = z.record(z.string(), DemoSettings);

function settingsFile(): string {
  return path.join(path.resolve(process.cwd(), serverEnv().dataDir), "demo-settings.json");
}

function readAll(): Record<string, DemoSettings> {
  try {
    const f = settingsFile();
    if (!fs.existsSync(f)) return {};
    const parsed = SettingsFile.safeParse(JSON.parse(fs.readFileSync(f, "utf8")));
    return parsed.success ? parsed.data : {};
  } catch {
    return {}; // unreadable switches must never break an AI call: fall back to "off"
  }
}

function writeAll(all: Record<string, DemoSettings>) {
  const f = settingsFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
  fs.renameSync(tmp, f);
}

/** This account's switches (all off by default). */
export function getDemoSettings(userId: string): DemoSettings {
  return { ...DEFAULT_DEMO_SETTINGS, ...readAll()[userId] };
}

/** Change some of this account's switches; returns the new state. Synchronous, so writes never interleave. */
export function setDemoSettings(userId: string, patch: Partial<DemoSettings>): DemoSettings {
  const all = readAll();
  const given = Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v === "boolean")); // undefined = keep
  const next = DemoSettings.parse({ ...DEFAULT_DEMO_SETTINGS, ...all[userId], ...given });
  if (!next.deterministicJury && !next.aiMock) delete all[userId];
  else all[userId] = next;
  writeAll(all);
  return next;
}

/** Normalised emails listed in DEMO_EMAILS (comma or whitespace separated). */
export function demoEmails(): string[] {
  return (process.env.DEMO_EMAILS ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** True when this account is one of the stage accounts (DEMO_EMAILS). Only these get the demo Pro grant in production. */
export function isDemoEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return demoEmails().includes(e);
}
