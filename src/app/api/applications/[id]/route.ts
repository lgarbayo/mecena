// Owned by WP-08. Read and edit a draft (the user has the last word on every text). Only the owner's drafts.
import { UpdateApplicationRequest } from "@/contracts/api";
import { draftSources } from "@/features/drafting/service";
import { fitBudget } from "@/features/drafting/rules";
import { ownedApplication, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { getCall, nowIso, saveApplication } from "@/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, { params }: Ctx) => {
  const application = ownedApplication(requireUser(req).id, (await params).id);
  return json({ application, sources: draftSources(application) });
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const app = ownedApplication(requireUser(req).id, (await params).id);
  const patch = await body(req, UpdateApplicationRequest);
  // user edits are kept as written; budget lines still have to be allowed by the bases and fit the maximum
  const budget = patch.budget ? fitBudget(patch.budget, getCall(app.callId)) : app.budget;
  const application = await saveApplication({ ...app, ...patch, budget, version: app.version + 1, updatedAt: nowIso() });
  return json({ application, sources: draftSources(application) });
});
