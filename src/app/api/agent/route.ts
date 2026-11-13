// Owned by WP-04. In-app agent over the shared tools module: POST { message, history, appUserId? } -> { reply, toolCalls }.
import { z } from "zod";
import { AgentRequest } from "@/contracts/api";
import { runAgent } from "@/features/agent/service";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

// appUserId is optional and not yet in the shared contract (see WP-04 contract change request); without it the store's meta.appUserId is used.
const Body = AgentRequest.extend({ appUserId: z.string().min(1).optional() });

export const POST = route(async (req: Request) => {
  const { message, history, appUserId } = Body.parse(await req.json().catch(() => ({})));
  return json(await runAgent(message, history, { appUserId }));
});
