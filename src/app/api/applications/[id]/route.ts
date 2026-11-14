// Owned by WP-08. Read and edit a draft (the user has the last word on every text). Only the owner's drafts.
import type { Application } from "@/contracts";
import { UpdateApplicationRequest } from "@/contracts/api";
import { draftSources } from "@/features/drafting/service";
import { validateBudget } from "@/features/drafting/rules";
import { ownedApplication, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { idempotent } from "@/server/idempotency";
import { getCall, nowIso, saveApplication } from "@/server/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const GET = route(async (req: Request, { params }: Ctx) => {
  const application = ownedApplication(requireUser(req).id, (await params).id);
  return json({ application, sources: draftSources(application) });
});

/**
 * Saves the user's edits as written. Budget edits are checked, never rewritten: a line the bases do not allow or a
 * total above the maximum is a 400 with the reason (the page keeps what they typed). The version (which invalidates the
 * jury score) only changes when the text or the budget changes, not when a document is ticked.
 */
export const PATCH = route(idempotent(async (req: Request, { params }: Ctx) => {
  const app = ownedApplication(requireUser(req).id, (await params).id);
  const patch = await body(req, UpdateApplicationRequest);
  let budget = app.budget;
  if (patch.budget) {
    const checked = validateBudget(patch.budget, getCall(app.callId));
    if ("error" in checked) return json({ error: "bad_request", message: checked.error }, { status: 400 });
    budget = checked.budget;
  }
  const sections = patch.sections ?? app.sections;
  const checklist = patch.checklist ?? app.checklist;
  const contentChanged = !same(sections, app.sections) || !same(budget, app.budget);
  if (!contentChanged && same(checklist, app.checklist)) return json({ application: app, sources: draftSources(app) });
  const next: Application = { ...app, sections, budget, checklist, version: contentChanged ? app.version + 1 : app.version, updatedAt: nowIso() };
  const application = await saveApplication(next);
  return json({ application, sources: draftSources(application) });
}));
