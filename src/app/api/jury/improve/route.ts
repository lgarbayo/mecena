// Owned by WP-08. Apply the jury's fixes (from the user's own words) and re-score: 61 -> 84.
import { JuryImproveRequest } from "@/contracts/api";
import { improveApplication } from "@/features/jury/service";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => json(await improveApplication(await body(req, JuryImproveRequest))));
