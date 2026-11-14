// IDEA #7: POST { applicationId, notes? } drafts the final memoria; PATCH { applicationId, sections } saves the user's edits.
import { GenerateMemoriaRequest, SaveMemoriaRequest } from "@/contracts/api";
import { generateMemoria, saveMemoria } from "@/features/justification/service";
import { ownedApplication, requireUser } from "@/server/auth";
import { limitAi } from "@/server/ai-limits";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  limitAi(user, "justification-memoria");
  const { applicationId, notes } = await body(req, GenerateMemoriaRequest);
  ownedApplication(user.id, applicationId);
  return json(await generateMemoria(applicationId, notes));
});

export const PATCH = route(async (req: Request) => {
  const user = requireUser(req);
  const { applicationId, sections } = await body(req, SaveMemoriaRequest);
  ownedApplication(user.id, applicationId);
  return json(await saveMemoria(applicationId, sections));
});
