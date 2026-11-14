// Owned by WP-08. Simulated jury: GET latest score, POST score the current version.
// POST reuses the score of the current version (or joins the scoring in flight, e.g. the prewarm from the draft page)
// unless force: true. With "Accept: application/x-ndjson" it streams one line per judge as they finish.
import { JuryRequest } from "@/contracts/api";
import { ensureScore, scoreApplication, type JudgeEvent } from "@/features/jury/service";
import { juryStream, wantsStream } from "@/features/jury/stream";
import { withJuryRun } from "@/features/purchases/server";
import { ownedApplication, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { idempotent } from "@/server/idempotency";
import { getApplication, latestJuryScore } from "@/server/store";
import { limitAi } from "@/server/ai-limits";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const id = new URL(req.url).searchParams.get("applicationId") ?? "";
  const application = ownedApplication(requireUser(req).id, id);
  return json({ score: latestJuryScore(id) ?? null, application });
});

export const POST = route(idempotent(async (req: Request) => {
  const user = requireUser(req);
  limitAi(user, "jury");
  const { applicationId, force } = await body(req, JuryRequest);
  ownedApplication(user.id, applicationId);
  // Pro, or the runs included with the application (402 when they are used up). Only a real scoring is charged: a cached
  // score, and the re-score right after an improvement (already charged by /api/jury/improve), are free.
  const run = async (onJudge?: (e: JudgeEvent) => void) => {
    const app = getApplication(applicationId);
    const latest = latestJuryScore(applicationId);
    const cached = !force && !!latest && latest.applicationVersion === app.version;
    const afterImprove = !force && app.revision?.version === app.version;
    const score = () => (force ? scoreApplication(applicationId, { onJudge }) : ensureScore(applicationId, { onJudge }).then((r) => r.score));
    if (cached || afterImprove) return { score: await score(), cached };
    return { score: await withJuryRun(user.appUserId, applicationId, score), cached: false };
  };
  if (wantsStream(req))
    return juryStream(async (emit) => {
      const { score, cached } = await run((e) => emit({ type: "judge", ...e }));
      return { type: "done", score, application: getApplication(applicationId), cached };
    });
  const { score } = await run();
  return json({ score, application: getApplication(applicationId) });
}, { stream: true }));
