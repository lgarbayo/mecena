/** Shared by server and browser (no server imports here). */
import type { CropSuggestion } from "@/contracts";

/** "Show the whole photo": the default whenever we are unsure. */
export const IDENTITY_CROP: CropSuggestion = { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 };
