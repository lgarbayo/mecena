// Owned by WP-04. In-app agent over the shared tools module: POST { message, history } -> { reply, toolCalls }.
// The tools run as the signed-in user (session): their active profile and their RevenueCat app user id.
// Any appUserId in the body (older clients) is ignored.
import { AgentRequest } from "@/contracts/api";
import { runAgent } from "@/features/agent/service";
import { requireUser, toolContextFor } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const { message, history } = AgentRequest.parse(await req.json().catch(() => ({})));
  return json(await runAgent(message, history, await toolContextFor(user, "app")));
});
