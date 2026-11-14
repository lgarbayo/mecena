// Owned by WP-01 (CCR-8). POST: import the user's existing dossier (PDF, photo or pasted text) into profile + dossier.
import { ImportDossierRequest } from "@/contracts/api";
import { ImportUnsupportedError, importDossier } from "@/features/onboarding/import";
import { scheduleProfileSearch } from "@/features/calls-ingest/live";
import { requireUser, resolveProfile } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = route(async (req: Request) => {
  try {
    const user = requireUser(req);
    const input = await body(req, ImportDossierRequest);
    const profile = await resolveProfile(user, input.profileId);
    const result = await importDossier({ ...input, profileId: profile.id });
    scheduleProfileSearch({ profileId: profile.id, appUserId: user.appUserId }); // new profile data: search BDNS for it
    return json(result);
  } catch (e) {
    if (e instanceof ImportUnsupportedError) return json({ error: "unsupported", message: e.message }, { status: 422 });
    throw e;
  }
});
