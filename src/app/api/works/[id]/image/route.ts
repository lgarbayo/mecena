// Owned by WP-02. Serves the uploaded photo bytes, only to the owner of the work.
import { NotFoundError } from "@/contracts";
import { readWorkImage } from "@/features/works/service";
import { ownedWork, requireUser } from "@/server/auth";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = ownedWork(requireUser(req).id, (await params).id);
  const img = readWorkImage(id);
  if (!img) throw new NotFoundError("image");
  return new Response(new Uint8Array(img.bytes), { headers: { "content-type": img.mediaType, "cache-control": "private, no-store" } });
});
