// Owned by WP-04. In-app agent over the shared tools module.
import { AgentRequest } from "@/contracts/api";
import { runAgent } from "@/features/agent/service";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const { message, history } = await body(req, AgentRequest);
  return json(await runAgent(message, history));
});
