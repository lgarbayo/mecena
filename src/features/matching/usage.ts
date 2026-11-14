/**
 * Free plan: FREE_MATCHES_PER_MONTH matched calls per month, counted for real in db.usage (the call ids a user has
 * unlocked this month, per profile so each mode has its own 3). Every front door respects it: the feed, the call
 * detail, ?q= searches and the tools (search_calls / explain_call through applyFreeMatchLimit). Pro sees everything.
 * appUserId always comes from the session (route) or the ToolContext, never from the client.
 */
import { FREE_MATCHES_PER_MONTH, type Call, type MatchResult } from "@/contracts";
import { resolveEntitlement } from "@/features/purchases/server";
import { readDb, updateDb } from "@/server/store";

/** YYYY-MM in Spain. */
export function monthKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}

interface Who {
  appUserId: string;
  profileId: string;
  now?: Date;
}

/** Call ids this user unlocked this month for this profile. */
export function unlockedCallIds({ appUserId, profileId, now }: Who): string[] {
  const month = monthKey(now);
  return readDb().usage.find((u) => u.appUserId === appUserId && u.month === month && u.profileId === profileId)?.callIds ?? [];
}

/**
 * Unlock calls in the given order until the month's free quota is used, and persist it. Returns the unlocked set
 * (those already unlocked this month plus the new ones). Never unlocks more than FREE_MATCHES_PER_MONTH.
 */
export async function unlockCalls(who: Who, candidates: readonly string[]): Promise<Set<string>> {
  const month = monthKey(who.now);
  const current = unlockedCallIds(who);
  const add = candidates.filter((id, i) => !current.includes(id) && candidates.indexOf(id) === i).slice(0, Math.max(0, FREE_MATCHES_PER_MONTH - current.length));
  if (!add.length) return new Set(current);
  return updateDb((db) => {
    let row = db.usage.find((u) => u.appUserId === who.appUserId && u.month === month && u.profileId === who.profileId);
    if (!row) {
      row = { appUserId: who.appUserId, month, profileId: who.profileId, callIds: [], matchesViewed: 0 };
      db.usage.push(row);
    }
    for (const id of add) if (row.callIds.length < FREE_MATCHES_PER_MONTH && !row.callIds.includes(id)) row.callIds.push(id);
    row.matchesViewed = row.callIds.length;
    return new Set(row.callIds);
  });
}

/** Can this user see the full match for this call? Unlocks it when the month's quota allows. Pro: always. */
export async function canSeeCall(who: Who & { callId: string; pro?: boolean }): Promise<boolean> {
  const pro = who.pro ?? (await resolveEntitlement(who.appUserId)).pro;
  if (pro) return true;
  return (await unlockCalls(who, [who.callId])).has(who.callId);
}

/** What a free user sees of a call beyond the month's quota: the public call data and the score, no reasons. */
export function lockedMatch(m: MatchResult): MatchResult {
  return { callId: m.callId, profileId: m.profileId, score: m.score, eligible: m.eligible, whyYouFit: [], whatYouMiss: [], generatedBy: "rules" };
}

export type MaybeLocked<T> = T & { locked?: boolean; paywall?: "match_limit" };

/**
 * Free-plan limit over a ranked list of matches (for src/tools and any other front door). Pro: unchanged. Free:
 * calls already unlocked this month stay full; the quota left is filled in order with calls you can apply for now
 * (open/upcoming; a closed edition never uses one of your 3 by itself); the rest become a limited preview with
 * `locked: true` and `paywall: "match_limit"`.
 */
export async function applyFreeMatchLimit<T extends { call: Call; match: MatchResult }>(
  items: readonly T[],
  who: Who & { pro?: boolean },
): Promise<MaybeLocked<T>[]> {
  const pro = who.pro ?? (await resolveEntitlement(who.appUserId)).pro;
  if (pro) return [...items];
  const unlocked = await unlockCalls(
    who,
    items.filter((r) => r.call.status !== "recurring").map((r) => r.call.id),
  );
  return items.map((r) => (unlocked.has(r.call.id) ? r : { ...r, match: lockedMatch(r.match), locked: true, paywall: "match_limit" as const }));
}
