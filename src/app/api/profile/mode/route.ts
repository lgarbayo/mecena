import { ProfileModeRequest } from "@/contracts/api";
import { body, json, route } from "@/server/http";
import { getMeta, setActiveMode } from "@/server/store";

export const dynamic = "force-dynamic";

/** Switch the active demo profile between creator and business (mode switch in the header). */
export const POST = route(async (req: Request) => {
  const { kind } = await body(req, ProfileModeRequest);
  return json({ profile: await setActiveMode(kind), appUserId: getMeta().appUserId });
});
