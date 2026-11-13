// Owned by WP-02.
import { CreateWorkRequest } from "@/contracts/api";
import { createWork } from "@/features/works/service";
import { body, json, route } from "@/server/http";
import { getProfile, listWorks } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = route(async (req: Request) => {
  const profile = getProfile(new URL(req.url).searchParams.get("profileId") ?? undefined);
  return json({ works: listWorks(profile.id) });
});

export const POST = route(async (req: Request) => json({ work: await createWork(await body(req, CreateWorkRequest)) }, { status: 201 }));
