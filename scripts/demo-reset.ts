// STUB (scaffold). Owned by WP-09. Usage: npm run demo:reset [-- --onboarded]
import { resetDemo } from "@/features/demo/service";

const scenario = process.argv.includes("--onboarded") ? "onboarded" : "blank";
resetDemo({ scenario }).then((r) => console.log(`[demo] reset (${scenario}) appUserId=${r.appUserId}`));
