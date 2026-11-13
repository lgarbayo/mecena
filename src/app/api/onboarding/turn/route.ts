// Owned by WP-01. Baseline: one onboarding turn (transcript chunk -> profile patch + dossier sections).
import { OnboardingTurnRequest } from "@/contracts/api";
import { processTurn } from "@/features/onboarding/service";
import { body, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => json(await processTurn(await body(req, OnboardingTurnRequest))));
