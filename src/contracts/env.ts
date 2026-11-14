/**
 * Env var names and typed readers. Server-only values must never be read in client components.
 * See .env.example for documentation.
 */
export const ENV = {
  ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY",
  MECENA_AI_MOCK: "MECENA_AI_MOCK",
  MECENA_MODEL_FAST: "MECENA_MODEL_FAST",
  MECENA_MODEL_SMART: "MECENA_MODEL_SMART",
  NEXT_PUBLIC_REVENUECAT_API_KEY: "NEXT_PUBLIC_REVENUECAT_API_KEY",
  REVENUECAT_SECRET_API_KEY: "REVENUECAT_SECRET_API_KEY",
  NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID: "NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID",
  NEXT_PUBLIC_REVENUECAT_OFFERING_ID: "NEXT_PUBLIC_REVENUECAT_OFFERING_ID",
  NEXT_PUBLIC_PURCHASES_MOCK: "NEXT_PUBLIC_PURCHASES_MOCK",
  MECENA_DATA_DIR: "MECENA_DATA_DIR",
  MECENA_PUBLIC_URL: "MECENA_PUBLIC_URL",
  MECENA_CALLS_DIR: "MECENA_CALLS_DIR",
  MECENA_SEED_FILE: "MECENA_SEED_FILE",
  BDNS_API_BASE: "BDNS_API_BASE",
  MECENA_SIGNUP_CODE: "MECENA_SIGNUP_CODE", // optional invite code: when set, creating an account requires it
  MECENA_USER_EMAIL: "MECENA_USER_EMAIL", // MCP server only: the account it acts as
  MECENA_CALLS_LIVE: "MECENA_CALLS_LIVE",
} as const;

export const DEFAULT_MODELS = { fast: "claude-sonnet-5-5", smart: "claude-opus-5-5" } as const;

export function serverEnv() {
  const e = process.env;
  return {
    anthropicApiKey: e.ANTHROPIC_API_KEY || undefined,
    aiMock: e.MECENA_AI_MOCK === "1" || !e.ANTHROPIC_API_KEY,
    modelFast: e.MECENA_MODEL_FAST || DEFAULT_MODELS.fast,
    modelSmart: e.MECENA_MODEL_SMART || DEFAULT_MODELS.smart,
    revenueCatSecretKey: e.REVENUECAT_SECRET_API_KEY || undefined,
    dataDir: e.MECENA_DATA_DIR || "./data/runtime",
    callsDir: e.MECENA_CALLS_DIR || "./data/calls", // calls.json (+ bdns-cache.json, awards.json)
    seedFile: e.MECENA_SEED_FILE || "./data/demo/seed.json", // demo seed (WP-09); tests point it elsewhere
    publicUrl: (e.MECENA_PUBLIC_URL || "http://localhost:3000").replace(/\/$/, ""),
    bdnsApiBase: e.BDNS_API_BASE || "https://www.infosubvenciones.es/bdnstrans/api",
    signupCode: e.MECENA_SIGNUP_CODE?.trim() || undefined,
    mcpUserEmail: e.MECENA_USER_EMAIL?.trim().toLowerCase() || undefined,
  };
}

/** Safe in client components: Next inlines NEXT_PUBLIC_* at build time (must be accessed literally). */
export function publicEnv() {
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY || "";
  return {
    revenueCatApiKey: apiKey || undefined,
    entitlementId: process.env.NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID || "pro",
    offeringId: process.env.NEXT_PUBLIC_REVENUECAT_OFFERING_ID || "default",
    purchasesMock: process.env.NEXT_PUBLIC_PURCHASES_MOCK === "1" || !apiKey,
  };
}
