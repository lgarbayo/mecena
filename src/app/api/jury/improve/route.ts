// Owned by WP-08. Apply the jury's fixes (from the user's own words and the facts they typed) and re-score: 61 -> 84.
// stage "revise": only revise (the page then re-scores through POST /api/jury with per-judge progress).
// Only fixes proposed by that score are applied (filtered server-side); a retry after a failed re-score never revises twice.
import { JuryImproveRequest } from "@/contracts/api";
import { improveApplication, reviseFromScore } from "@/features/jury/service";
import { withJuryRun } from "@/features/purchases/server";
import { getApplication } from "@/server/store";
import { ownedApplication, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { idempotent } from "@/server/idempotency";
import { limitAi } from "@/server/ai-limits";

export const dynamic = "force-dynamic";

export const POST = route(idempotent(async (req: Request) => {
  const user = requireUser(req);
  limitAi(user, "jury-improve");
  const { stage, ...input } = await body(req, JuryImproveRequest);
  ownedApplication(user.id, input.applicationId);
  // Pro, or the runs included with the application (402 when they are used up). An improvement counts as one run
  // (the revision; its re-score through POST /api/jury is not charged again). A retry of an already revised version is free.
  const app = getApplication(input.applicationId);
  const alreadyRevised = app.revision?.fromScoreId === input.scoreId && app.revision.version === app.version;
  const charge = <T,>(fn: () => Promise<T>) => (alreadyRevised ? fn() : withJuryRun(user.appUserId, input.applicationId, fn));
  if (stage === "revise") {
    const { application, previous, alreadyRevised: again } = await charge(() => reviseFromScore(input));
    return json({ application, previous, alreadyRevised: again });
  }
  return json(await charge(() => improveApplication(input)));
}));
