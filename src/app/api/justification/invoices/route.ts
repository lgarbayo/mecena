// IDEA #7: POST { applicationId, imageDataUrl, hint? } -> a photo of an invoice, read and assigned to a budget line.
import { CreateInvoiceRequest } from "@/contracts/api";
import { addInvoice } from "@/features/justification/service";
import { ownedApplication, requireUser } from "@/server/auth";
import { limitAi } from "@/server/ai-limits";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

/** A photo of up to 6 MB is ~8 MB as a base64 data URL, plus the note. */
const MAX_INVOICE_BODY_BYTES = 9 * 1024 * 1024;

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  limitAi(user, "justification-invoice");
  const input = await body(req, CreateInvoiceRequest, { maxBytes: MAX_INVOICE_BODY_BYTES });
  ownedApplication(user.id, input.applicationId);
  return json(await addInvoice(input), { status: 201 });
});
