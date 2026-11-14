// B2B panel. GET -> the signed-in user's panel (their organisation, or the marked demo one); POST { name, kind } creates it.
import { OrgCreateRequest } from "@/contracts/api";
import { createOrganization, panelOrDemo } from "@/features/panel/service";
import { requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const user = requireUser(req);
  return json(panelOrDemo(user, { demo: new URL(req.url).searchParams.get("demo") === "1" }));
});

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  const org = await createOrganization(user, await body(req, OrgCreateRequest));
  return json({ org, panel: panelOrDemo(user) }, { status: 201 });
});
