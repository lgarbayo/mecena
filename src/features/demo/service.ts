// STUB (scaffold, working baseline). Owned by WP-09: scenarios, seed polish, uploads cleanup.
import { getMeta, initialDb, resetDb, rotateAppUserId } from "@/server/store";

export async function resetDemo(input: { scenario: "blank" | "onboarded" }): Promise<{ ok: true; appUserId: string; activeProfileId: string }> {
  void input.scenario; // TODO(WP-09): "onboarded" = creator already filled (fallback if the live voice fails)
  await resetDb(initialDb());
  const appUserId = await rotateAppUserId();
  return { ok: true, appUserId, activeProfileId: getMeta().activeProfileId };
}
