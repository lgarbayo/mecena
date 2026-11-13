// Owned by WP-02.
import { UpdateWorkRequest } from "@/contracts/api";
import { updateWork } from "@/features/works/service";
import { body, json, route } from "@/server/http";
import { getWork } from "@/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => json({ work: getWork((await params).id) }));

export const PATCH = route(async (req: Request, { params }: Ctx) => json({ work: await updateWork((await params).id, await body(req, UpdateWorkRequest)) }));
