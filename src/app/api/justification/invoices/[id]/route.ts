// IDEA #7: PATCH the fields or the budget line of an invoice (the user has the last word), DELETE it.
import { UpdateInvoiceRequest } from "@/contracts/api";
import { removeInvoice, updateInvoice } from "@/features/justification/service";
import { ownedInvoice, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const inv = ownedInvoice(requireUser(req).id, (await params).id);
  return json(await updateInvoice(inv.id, await body(req, UpdateInvoiceRequest)));
});

export const DELETE = route(async (req: Request, { params }: Ctx) => {
  const inv = ownedInvoice(requireUser(req).id, (await params).id);
  return json(await removeInvoice(inv.id));
});
