// Owned by WP-08. Simulated jury: GET latest score, POST run a new scoring.
import { JuryRequest } from "@/contracts/api";
import { scoreApplication } from "@/features/jury/service";
import { body, json, route } from "@/server/http";
import { getApplication, latestJuryScore } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("applicationId") ?? "";
  const application = getApplication(id);
  return json({ score: latestJuryScore(id) ?? null, application });
});

export const POST = route(async (req: Request) => {
  const { applicationId } = await body(req, JuryRequest);
  const score = await scoreApplication(applicationId);
  return json({ score, application: getApplication(applicationId) });
});
