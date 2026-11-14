// Owned by WP-08. Apply the jury's fixes (from the user's own words) and re-score: 61 -> 84.
import { JuryImproveRequest } from "@/contracts/api";
import { improveApplication } from "@/features/jury/service";
import { withJuryRun } from "@/features/purchases/server";
import { ownedApplication, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const input = await body(req, JuryImproveRequest);
  ownedApplication(user.id, input.applicationId);
  // Pro, or the runs included with the application (402 when they are used up)
  return json(await withJuryRun(user.appUserId, input.applicationId, () => improveApplication(input)));
});
