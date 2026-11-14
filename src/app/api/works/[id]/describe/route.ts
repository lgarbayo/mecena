// Owned by WP-02. POST { voiceDescription? } -> the one vision call for a stored photo: technical sheet + crop,
// with the note the artist dictated while the photo was uploading (if any). Same photo, same untouched bytes.
import { z } from "zod";
import { describeWork } from "@/features/works/service";
import { ownedWork, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";
import { limitAi } from "@/server/ai-limits";

export const dynamic = "force-dynamic";

const DescribeRequest = z.object({ voiceDescription: z.string().trim().max(4000).optional() });

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = requireUser(req);
  const work = ownedWork(user.id, (await params).id);
  limitAi(user, "works-describe");
  const { voiceDescription } = await body(req, DescribeRequest);
  return json({ work: await describeWork(work.id, voiceDescription) });
});
