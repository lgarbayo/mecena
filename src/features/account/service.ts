/**
 * "Borrar mi cuenta" (DELETE /api/auth/me): the account and everything it owns, in db.json and on disk. Other
 * accounts are never touched. What stays: nothing personal (the shared BDNS catalogue holds public call data only).
 */
import fs from "node:fs";
import path from "node:path";
import type { Db, User } from "@/contracts";
import { exportsDir, updateDb, uploadsDir } from "@/server/store";
import { forgetDesigns } from "@/features/dossier/designs";
import { forgetProfileSearches } from "@/features/calls-ingest/live";
import { forgetDeepResearch, forgetDeepResearchUsage } from "@/features/deep-research/service";

export interface RemovedData {
  profileIds: string[];
  workIds: string[];
  invoiceIds: string[];
  appUserIds: string[];
}

/**
 * Removes from `db` (in place) every record of the user's profiles and of their RevenueCat app user id: profiles,
 * transcripts, works, dossiers, applications, jury scores, usage, entitlement, match and dossier-variant caches.
 */
export function removeOwnedData(db: Db, user: Pick<User, "id" | "appUserId">): RemovedData {
  const profileIds = new Set(db.profiles.filter((p) => p.ownerId === user.id).map((p) => p.id));
  const workIds = db.works.filter((w) => profileIds.has(w.profileId)).map((w) => w.id);
  const appIds = new Set(db.applications.filter((a) => profileIds.has(a.profileId)).map((a) => a.id));
  const invoiceIds = db.invoices.filter((i) => appIds.has(i.applicationId)).map((i) => i.id);
  const appUserIds = [user.appUserId];

  db.profiles = db.profiles.filter((p) => !profileIds.has(p.id));
  db.transcripts = db.transcripts.filter((t) => !profileIds.has(t.profileId));
  db.works = db.works.filter((w) => !profileIds.has(w.profileId));
  db.dossiers = db.dossiers.filter((d) => !profileIds.has(d.profileId));
  db.applications = db.applications.filter((a) => !appIds.has(a.id));
  db.juryScores = db.juryScores.filter((s) => !appIds.has(s.applicationId));
  db.invoices = db.invoices.filter((i) => !appIds.has(i.applicationId));
  db.justifications = db.justifications.filter((j) => !appIds.has(j.applicationId));
  db.usage = db.usage.filter((x) => !appUserIds.includes(x.appUserId));
  db.entitlements = db.entitlements.filter((e) => !appUserIds.includes(e.appUserId));
  db.matchCache = db.matchCache.filter((m) => !profileIds.has(m.profileId) && ![...profileIds].some((id) => m.cacheKey.startsWith(`${id}|`)));
  db.variantCache = db.variantCache.filter((v) => !v.profileId || !profileIds.has(v.profileId));
  return { profileIds: [...profileIds], workIds, invoiceIds, appUserIds };
}

/** Files of removed profiles: work photos, imported dossiers, PDF exports, designs, BDNS and deep-research state. */
export async function forgetOwnedFiles(removed: RemovedData, opts: { userId?: string } = {}): Promise<void> {
  forgetDesigns(removed.profileIds);
  await Promise.all([forgetProfileSearches(removed.profileIds), forgetDeepResearch(removed.profileIds)]);
  removeFiles(uploadsDir(), (f) => removed.workIds.some((id) => f.startsWith(`${id}.`)) || removed.invoiceIds.some((id) => f.startsWith(`${id}.`)) || removed.profileIds.some((id) => f.startsWith(`dossier-import-${id}.`)));
  removeFiles(exportsDir(), (f) => removed.profileIds.some((id) => f === `dossier-${id}.pdf` || f.startsWith(`dossier-${id}-`)));
  if (opts.userId) await forgetDeepResearchUsage({ userId: opts.userId, profileIds: removed.profileIds, appUserIds: removed.appUserIds });
}

function removeFiles(dir: string, match: (file: string) => boolean) {
  for (const f of fs.readdirSync(dir)) if (match(f)) fs.rmSync(path.join(dir, f), { force: true });
}

/** Deletes the account, its sessions and everything it owns. */
export async function deleteAccount(user: Pick<User, "id">): Promise<void> {
  const removed = await updateDb((db) => {
    const u = db.users.find((x) => x.id === user.id);
    if (!u) return undefined;
    const r = removeOwnedData(db, u);
    db.users = db.users.filter((x) => x.id !== u.id);
    db.sessions = db.sessions.filter((s) => s.userId !== u.id);
    return r;
  });
  if (removed) await forgetOwnedFiles(removed, { userId: user.id });
}
