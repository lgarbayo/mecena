// Owned by WP-04. DELETE: revoke one of the signed-in user's MCP tokens (another user's id is a 404).
import { readJson, json, route } from "@/server/http";
import { requireUser, revokeMcpToken } from "@/server/auth";

export const dynamic = "force-dynamic";

export const DELETE = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = requireUser(req);
  await readJson(req); // same cross-site guard as every other mutating route
  const { id } = await ctx.params;
  await revokeMcpToken(user.id, id);
  return json({ ok: true });
});
