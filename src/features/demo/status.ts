// Owned by WP-09. What /demo and `npm run demo:preflight` need to know about the signed-in account, without spending
// AI or changing anything: switches, modes, entitlement, open calls and whether every scenario can load.
import { publicEnv, serverEnv, type User } from "@/contracts";
import { getEntitlement, listCalls, readDb } from "@/server/store";
import { checkScenarios, type ScenarioCheck } from "./scenarios";
import { canGrantDemoPro, DEMO_PRODUCT_ID } from "./service";
import { getDemoSettings, isDemoEmail, type DemoSettings } from "./settings";

export interface DemoStatus {
  email: string;
  appUserId: string;
  activeProfileKind: "creator" | "business" | null;
  settings: DemoSettings;
  /** What the server runs on: anthropic (owner's key) or mock (no key / MECENA_AI_MOCK=1). */
  aiMode: "anthropic" | "mock";
  /** What this account effectively gets (its own «IA simulada» switch included). */
  effectiveAiMode: "anthropic" | "mock";
  purchasesMode: "revenuecat" | "mock";
  /** REVENUECAT_SECRET_API_KEY is set: purchases are re-verified with RevenueCat REST. */
  revenueCatVerified: boolean;
  demoAccount: boolean;
  canLoadPro: boolean;
  pro: boolean;
  proIsDemoGrant: boolean;
  openCalls: { creator: number; business: number };
  scenarios: ScenarioCheck[];
}

export async function demoStatus(user: User): Promise<DemoStatus> {
  const env = serverEnv();
  const settings = getDemoSettings(user.id);
  const ent = getEntitlement(user.appUserId);
  const active = readDb().profiles.find((p) => p.id === user.activeProfileId && p.ownerId === user.id);
  const calls = listCalls();
  const open = calls.filter((c) => c.status === "open");
  return {
    email: user.email,
    appUserId: user.appUserId,
    activeProfileKind: active?.kind ?? null,
    settings,
    aiMode: env.aiMock ? "mock" : "anthropic",
    effectiveAiMode: env.aiMock || settings.aiMock ? "mock" : "anthropic",
    purchasesMode: publicEnv().purchasesMock ? "mock" : "revenuecat",
    revenueCatVerified: Boolean(env.revenueCatSecretKey),
    demoAccount: isDemoEmail(user.email),
    canLoadPro: canGrantDemoPro(user),
    pro: ent.pro,
    proIsDemoGrant: ent.pro && ent.activeProductId === DEMO_PRODUCT_ID,
    openCalls: {
      creator: open.filter((c) => c.beneficiaryKinds.includes("creator")).length,
      business: open.filter((c) => c.beneficiaryKinds.includes("business")).length,
    },
    scenarios: checkScenarios(calls),
  };
}
