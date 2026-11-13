// Owned by WP-02. GET one work, PATCH sheet/crop/confirmed/order, DELETE (removes the stored photo too).
import { UpdateWorkRequest } from "@/contracts/api";
import { deleteWork, updateWork } from "@/features/works/service";
import { body, json, route } from "@/server/http";
import { getWork } from "@/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => json({ work: getWork((await params).id) }));

export const PATCH = route(async (req: Request, { params }: Ctx) => json({ work: await updateWork((await params).id, await body(req, UpdateWorkRequest)) }));

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  await deleteWork((await params).id);
  return json({ ok: true });
});
