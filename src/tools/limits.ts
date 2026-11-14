/**
 * The free plan, as the tools apply it (both front doors: MCP and the in-app agent). Same rule as the calls feed
 * (/convocatorias, callsFeed): without Pro you see your top FREE_MATCHES_PER_MONTH matches of the full ranking, the
 * rest only as a count. The tools never reveal a call beyond those, whatever query the model sends, so neither MCP
 * nor the agent can be used to get around the paywall.
 */
import { FREE_MATCHES_PER_MONTH, PaymentRequiredError, type Call, type MatchResult, type ToolContext } from "@/contracts";
import { applyFreeMatchLimit, canSeeCall } from "@/features/matching/usage";
import { resolveEntitlement } from "@/features/purchases/server";
import { getCall } from "@/server/store";

export const MATCH_LIMIT_MESSAGE = `Con el plan gratuito ves tus ${FREE_MATCHES_PER_MONTH} convocatorias del mes; para ver esta y el resto necesitas Mecena Pro`;

/**
 * Free-plan limit over a ranked list, using the same monthly unlock count as the feed (features/matching/usage):
 * what is already unlocked this month stays visible, the quota left is filled in order, the rest is only counted.
 */
export async function limitMatches<T extends { call: Call; match: MatchResult }>(
  ctx: ToolContext,
  profileId: string,
  items: readonly T[],
): Promise<{ pro: boolean; visible: T[]; lockedCount: number }> {
  const { pro } = await resolveEntitlement(ctx.appUserId);
  if (pro) return { pro, visible: [...items], lockedCount: 0 };
  const limited = await applyFreeMatchLimit(items, { appUserId: ctx.appUserId, profileId, pro });
  const visible = limited.filter((r) => !r.locked);
  return { pro, visible, lockedCount: limited.length - visible.length };
}

/** explain_call on the free plan: only a call unlocked this month (or a recurring one already closed) is explained. */
export async function requireCallVisible(ctx: ToolContext, profileId: string, callId: string): Promise<void> {
  if (getCall(callId).status === "recurring") return;
  if (!(await canSeeCall({ appUserId: ctx.appUserId, profileId, callId }))) throw new PaymentRequiredError(MATCH_LIMIT_MESSAGE);
}

/** Whether a call variant of the dossier (a Pro feature) may be built for this caller. */
export async function canAdaptDossier(ctx: ToolContext): Promise<boolean> {
  return (await resolveEntitlement(ctx.appUserId)).pro;
}
