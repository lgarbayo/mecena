// Owned by WP-02. Serves the uploaded photo bytes.
import { NotFoundError } from "@/contracts";
import { readWorkImage } from "@/features/works/service";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const img = readWorkImage(id);
  if (!img) throw new NotFoundError(`Imagen ${id}`);
  return new Response(new Uint8Array(img.bytes), { headers: { "content-type": img.mediaType, "cache-control": "no-store" } });
});
