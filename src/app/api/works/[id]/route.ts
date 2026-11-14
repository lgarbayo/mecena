// Owned by WP-02. GET one work, PATCH sheet/crop/confirmed/order, DELETE (removes the stored photo too).
// Only works of the signed-in user's profiles (anything else is a 404).
import { UpdateWorkRequest } from "@/contracts/api";
import { deleteWork, updateWork } from "@/features/works/service";
import { ownedWork, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const mine = async (req: Request, { params }: Ctx) => ownedWork(requireUser(req).id, (await params).id);

export const GET = route(async (req: Request, ctx: Ctx) => json({ work: await mine(req, ctx) }));

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  const work = await mine(req, ctx);
  return json({ work: await updateWork(work.id, await body(req, UpdateWorkRequest)) });
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const work = await mine(req, ctx);
  await deleteWork(work.id);
  return json({ ok: true });
});
