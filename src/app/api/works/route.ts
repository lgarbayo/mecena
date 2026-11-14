// Owned by WP-02. GET ?profileId -> works in order; POST photo (+ optional voice note) -> new work with its sheet.
import { NextResponse } from "next/server";
import { CreateWorkRequest } from "@/contracts/api";
import { createWork, InvalidImageError } from "@/features/works/service";
import { requireProfile, requireUser, resolveProfile } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { listWorks } from "@/server/store";
import { limitAi } from "@/server/ai-limits";

export const dynamic = "force-dynamic";

/** A photo of up to MAX_IMAGE_BYTES (6 MB) is ~8 MB as a base64 data URL, plus the voice note. */
const MAX_WORK_BODY_BYTES = 9 * 1024 * 1024;

export const GET = route(async (req: Request) => {
  const { profile } = await requireProfile(req, new URL(req.url).searchParams.get("profileId"));
  return json({ works: listWorks(profile.id) });
});

export const POST = route(async (req: Request) => {
  const user = requireUser(req);
  limitAi(user, "works-create");
  const input = await body(req, CreateWorkRequest, { maxBytes: MAX_WORK_BODY_BYTES });
  const profile = await resolveProfile(user, input.profileId);
  try {
    return json({ work: await createWork({ ...input, profileId: profile.id }) }, { status: 201 });
  } catch (e) {
    if (e instanceof InvalidImageError) return NextResponse.json({ error: "bad_request", message: e.message }, { status: 400 });
    throw e;
  }
});
