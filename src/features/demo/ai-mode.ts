/**
 * Which account the current request runs for, so the AI layer can honour that account's demo switches
 * (./settings.ts) without threading a user through every service. Server-only.
 *
 * requireUser() (src/server/auth) binds the signed-in account to the request's async context; getAi() and
 * isMockAi() (src/server/ai) read it. Code that runs outside a request (MCP stdio, the boot-time BDNS scheduler)
 * has no account bound and keeps the global behaviour (MECENA_AI_MOCK / ANTHROPIC_API_KEY).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_DEMO_SETTINGS, getDemoSettings, type DemoSettings } from "./settings";

interface AiScope {
  userId?: string;
  /** Forced switches (scenario loading); win over the account's stored ones. */
  force?: Partial<DemoSettings>;
}

// One instance per process even if Next bundles this module twice (route handlers vs. instrumentation).
const KEY = Symbol.for("mecena.demo.aiScope");
const g = globalThis as unknown as Record<symbol, AsyncLocalStorage<AiScope> | undefined>;
const scope: AsyncLocalStorage<AiScope> = (g[KEY] ??= new AsyncLocalStorage<AiScope>());

/**
 * Bind the signed-in account to the rest of this request (every await that follows sees it). Each incoming request
 * runs in its own async context, so this never leaks to another request.
 */
export function bindAiAccount(userId: string): void {
  const cur = scope.getStore();
  if (cur?.userId === userId) return;
  scope.enterWith({ ...cur, userId });
}

/** Run `fn` with some switches forced on (e.g. the mock jury while a demo scenario is being prepared). */
export function runWithAiSwitches<T>(force: Partial<DemoSettings>, fn: () => Promise<T>): Promise<T> {
  const cur = scope.getStore();
  return scope.run({ ...cur, force: { ...cur?.force, ...force } }, fn);
}

/** The switches that apply right now: the bound account's, plus any forced ones. All off outside a request. */
export function currentAiSwitches(): DemoSettings {
  const s = scope.getStore();
  if (!s) return DEFAULT_DEMO_SETTINGS;
  const stored = s.userId ? getDemoSettings(s.userId) : DEFAULT_DEMO_SETTINGS;
  return { ...stored, ...s.force };
}
