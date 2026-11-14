// Owned by WP-08. Simulated jury: GET latest score, POST run a new scoring.
import { JuryRequest } from "@/contracts/api";
import { scoreApplication } from "@/features/jury/service";
import { ownedApplication, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { getApplication, latestJuryScore } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("applicationId") ?? "";
  const application = ownedApplication(requireUser(req).id, id);
  return json({ score: latestJuryScore(id) ?? null, application });
});

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const { applicationId } = await body(req, JuryRequest);
  ownedApplication(user.id, applicationId);
  const score = await scoreApplication(applicationId);
  return json({ score, application: getApplication(applicationId) });
});
