// Admin CLI. Owned by WP-09. Usage: npm run demo:reset
// Resets the WHOLE database to its initial state: every account, session and profile is deleted.
// (Users reset only their own data from the app: POST /api/demo/reset.)
import { resetAllDemo } from "@/features/demo/service";

resetAllDemo().then(() => console.log("[demo] database reset: every account and profile was removed"));
