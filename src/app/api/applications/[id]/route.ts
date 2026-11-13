// Owned by WP-08. Read and edit a draft (the user has the last word on every text).
import { UpdateApplicationRequest } from "@/contracts/api";
import { body, json, route } from "@/server/http";
import { getApplication, nowIso, saveApplication } from "@/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => json({ application: getApplication((await params).id) }));

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const app = getApplication((await params).id);
  const patch = await body(req, UpdateApplicationRequest);
  return json({ application: await saveApplication({ ...app, ...patch, version: app.version + 1, updatedAt: nowIso() }) });
});
