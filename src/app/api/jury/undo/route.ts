// Owned by WP-08. "Deshacer mejoras": restore the draft from before the last "Aplicar mejoras" (and its score).
import { JuryUndoRequest } from "@/contracts/api";
import { undoImprovement } from "@/features/jury/service";
import { ownedApplication, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const { applicationId } = await body(req, JuryUndoRequest);
  ownedApplication(user.id, applicationId);
  return json(await undoImprovement(applicationId));
});
