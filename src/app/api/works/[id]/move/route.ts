// Owned by WP-02. POST { direction: -1 | 1 } -> swap with the neighbour and persist `order` for all works.
import { z } from "zod";
import { moveWork } from "@/features/works/service";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

const MoveRequest = z.object({ direction: z.union([z.literal(-1), z.literal(1)]) });

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { direction } = await body(req, MoveRequest);
  return json({ works: await moveWork((await params).id, direction) });
});
