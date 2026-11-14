// IDEA #7 justification: GET ?applicationId -> invoices, spending per budget line, deviation alerts and the final memoria.
import { justificationState } from "@/features/justification/service";
import { ownedApplication, requireUser } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const user = requireUser(req);
  const id = new URL(req.url).searchParams.get("applicationId") ?? "";
  ownedApplication(user.id, id);
  return json(justificationState(id));
});
