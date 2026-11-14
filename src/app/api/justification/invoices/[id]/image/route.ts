// IDEA #7: the photo of an invoice, only to its owner.
import { NotFoundError } from "@/contracts";
import { readInvoiceImage } from "@/features/justification/service";
import { ownedInvoice, requireUser } from "@/server/auth";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = ownedInvoice(requireUser(req).id, (await params).id);
  const img = readInvoiceImage(id);
  if (!img) throw new NotFoundError("image");
  return new Response(new Uint8Array(img.bytes), { headers: { "content-type": img.mediaType, "cache-control": "private, no-store" } });
});
