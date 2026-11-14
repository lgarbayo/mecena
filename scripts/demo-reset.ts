// Admin CLI. Owned by WP-09.
//   npm run demo:reset                                        -> resets the WHOLE database (every account is deleted)
//   npm run demo:reset -- --email a@b.c --scenario pro       -> only that account: wipe it and load a scenario
//                                                               (blank | onboarded | pro | business; --with-business for blank)
// Users reset only their own data from the app: /demo (POST /api/demo/reset). On Fly: `fly ssh console -C "sh -c 'cd /app && npx tsx scripts/demo-reset.ts --email …'"`.
import { DemoScenario } from "@/contracts/api";
import { findUserByEmail } from "@/server/auth";
import { resetAllDemo, resetUserDemo } from "@/features/demo/service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email");
  if (!email) {
    await resetAllDemo();
    console.log("[demo] database reset: every account and profile was removed");
    return;
  }
  const user = findUserByEmail(email);
  if (!user) throw new Error(`No account with email ${email}. Create it first at /entrar.`);
  const scenario = DemoScenario.parse(arg("scenario") ?? (process.argv.includes("--onboarded") ? "onboarded" : "blank"));
  const out = await resetUserDemo(user, { scenario, withBusiness: process.argv.includes("--with-business") });
  console.log(`[demo] ${email}: scenario ${out.scenario} loaded (appUserId ${out.appUserId}${out.applicationId ? `, application ${out.applicationId}` : ""})`);
}

main().catch((e) => {
  console.error(`[demo] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
