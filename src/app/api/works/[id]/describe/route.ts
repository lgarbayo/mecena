// Owned by WP-02. POST { voiceDescription } -> re-run the technical sheet with the note the artist
// dictated while the photo was uploading. Same photo, same untouched bytes.
import { z } from "zod";
import { describeWork } from "@/features/works/service";
import { ownedWork, requireUser } from "@/server/auth";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

const DescribeRequest = z.object({ voiceDescription: z.string().trim().min(1).max(4000) });

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const work = ownedWork(requireUser(req).id, (await params).id);
  const { voiceDescription } = await body(req, DescribeRequest);
  return json({ work: await describeWork(work.id, voiceDescription) });
});
