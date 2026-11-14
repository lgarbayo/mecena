// Owned by WP-09. Demo reset, per account: POST /api/demo/reset wipes only the signed-in user's own data.
// The admin CLI (scripts/demo-reset.ts) still resets the whole database.
import fs from "node:fs";
import path from "node:path";
import type { User } from "@/contracts";
import { blankProfileFor, newAppUserId } from "@/server/auth";
import { exportsDir, initialDb, resetDb, updateDb, uploadsDir } from "@/server/store";
import { forgetDesigns } from "@/features/dossier/designs";
import { forgetProfileSearches } from "@/features/calls-ingest/live";
import { forgetDeepResearch } from "@/features/deep-research/service";

export interface DemoResetResult {
  ok: true;
  appUserId: string;
  activeProfileId: string;
}

/**
 * Deletes everything the user owns (profiles, transcripts, works and their photos, dossiers, designs, PDF exports,
 * applications, jury scores, usage, match caches), gives them one blank creator profile and a fresh RevenueCat app
 * user id (so the paywall shows again). Other users are never touched.
 */
export async function resetUserDemo(user: User, input: { scenario: "blank" | "onboarded" }): Promise<DemoResetResult> {
  void input.scenario; // TODO(WP-09): "onboarded" = creator already filled (fallback if the live voice fails)
  const removed = await updateDb((db) => {
    const u = db.users.find((x) => x.id === user.id);
    if (!u) throw new Error("Usuario no encontrado");
    const profileIds = new Set(db.profiles.filter((p) => p.ownerId === user.id).map((p) => p.id));
    const workIds = db.works.filter((w) => profileIds.has(w.profileId)).map((w) => w.id);
    const appIds = new Set(db.applications.filter((a) => profileIds.has(a.profileId)).map((a) => a.id));
    const oldAppUserId = u.appUserId;

    db.profiles = db.profiles.filter((p) => !profileIds.has(p.id));
    db.transcripts = db.transcripts.filter((t) => !profileIds.has(t.profileId));
    db.works = db.works.filter((w) => !profileIds.has(w.profileId));
    db.dossiers = db.dossiers.filter((d) => !profileIds.has(d.profileId));
    db.applications = db.applications.filter((a) => !appIds.has(a.id));
    db.juryScores = db.juryScores.filter((s) => !appIds.has(s.applicationId));
    db.usage = db.usage.filter((x) => x.appUserId !== oldAppUserId);
    db.entitlements = db.entitlements.filter((e) => e.appUserId !== oldAppUserId);
    db.matchCache = db.matchCache.filter((m) => !profileIds.has(m.profileId) && ![...profileIds].some((id) => m.cacheKey.startsWith(`${id}|`)));

    const fresh = blankProfileFor(user.id, "creator");
    db.profiles.push(fresh);
    u.activeProfileId = fresh.id;
    u.appUserId = newAppUserId();
    return { profileIds: [...profileIds], workIds, appUserId: u.appUserId, activeProfileId: fresh.id };
  });

  forgetDesigns(removed.profileIds);
  await Promise.all([forgetProfileSearches(removed.profileIds), forgetDeepResearch(removed.profileIds)]);
  removeFiles(uploadsDir(), (f) => removed.workIds.some((id) => f.startsWith(`${id}.`)) || removed.profileIds.some((id) => f.startsWith(`dossier-import-${id}.`)));
  removeFiles(exportsDir(), (f) => removed.profileIds.some((id) => f === `dossier-${id}.pdf` || f.startsWith(`dossier-${id}-`)));
  return { ok: true, appUserId: removed.appUserId, activeProfileId: removed.activeProfileId };
}

function removeFiles(dir: string, match: (file: string) => boolean) {
  for (const f of fs.readdirSync(dir)) if (match(f)) fs.rmSync(path.join(dir, f), { force: true });
}

/** Admin CLI only: back to the initial database (every account and session is gone). */
export async function resetAllDemo(): Promise<void> {
  await resetDb(initialDb());
  await Promise.all([forgetProfileSearches(), forgetDeepResearch()]);
}
