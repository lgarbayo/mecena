import { ProfileModeRequest } from "@/contracts/api";
import { requireUser, switchMode } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { idempotent } from "@/server/idempotency";

export const dynamic = "force-dynamic";

/**
 * Mode switch in the header: the user's own creator/business profile (a blank one is created the first time).
 * Idempotent: a repeated switch with the same key replays the answer; switchMode itself reuses the existing profile.
 */
export const POST = route(
  idempotent(async (req: Request) => {
    const user = requireUser(req);
    const { kind } = await body(req, ProfileModeRequest);
    return json({ profile: await switchMode(user.id, kind), appUserId: user.appUserId });
  }),
);
