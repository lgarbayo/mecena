/**
 * Global test setup (scaffold-owned). Every test runs on AI mocks, the mock purchases adapter and an
 * isolated temporary data dir, with the fictional fixture calls (never data/calls or data/demo).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach } from "vitest";
import { fixtureCalls } from "@/fixtures";
import { resetRateLimits } from "@/server/auth/rate-limit";
import { useSession } from "./helpers";

// Opt-in live tests (MECENA_LIVE_TESTS=1) keep the real key aside; everything else stays on mocks.
if (process.env.MECENA_LIVE_TESTS === "1" && process.env.ANTHROPIC_API_KEY) process.env.MECENA_LIVE_ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
process.env.MECENA_AI_MOCK = "1";
process.env.NEXT_PUBLIC_PURCHASES_MOCK = "1";
process.env.ANTHROPIC_API_KEY = "";
process.env.REVENUECAT_SECRET_API_KEY = "";
process.env.MECENA_PUBLIC_URL = "http://localhost:3000";
delete process.env.MECENA_SIGNUP_CODE;
delete process.env.MECENA_USER_EMAIL;
process.env.MECENA_CALLS_LIVE = "0"; // no background BDNS searches or daily refresh (live tests call them directly)

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mecena-test-"));
  const calls = path.join(dir, "calls");
  fs.mkdirSync(calls);
  fs.writeFileSync(path.join(calls, "calls.json"), JSON.stringify(fixtureCalls));
  process.env.MECENA_DATA_DIR = path.join(dir, "runtime");
  process.env.MECENA_CALLS_DIR = calls;
  process.env.MECENA_SEED_FILE = path.join(dir, "no-seed.json");
  // No session unless a test logs in (tests/helpers.ts loginDemo / createUser).
  useSession(undefined);
  resetRateLimits();
});
