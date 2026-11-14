/**
 * Per-profile free-layout state, in dataDir()/dossier-layouts.json (beside, never inside, the template designs):
 * the template flow is untouched. Server-only.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataDir } from "@/server/store";
import { FreeLayout } from "./schema";

const Entry = z.object({
  enabled: z.boolean().default(false), // "Maquetación libre" switch
  current: FreeLayout.optional(),
  history: z.array(z.object({ request: z.string(), layout: FreeLayout, at: z.string() })).default([]),
  proposals: z.array(z.object({ id: z.string(), layout: FreeLayout, direction: z.string(), at: z.string() })).default([]), // the last batch, waiting for the artist to choose
  shown: z.array(z.string()).default([]), // art directions already proposed (not repeated in the next batch)
  wish: z.string().optional(), // how the artist imagines their dossier (onboarding question), for every batch
  wishSegments: z.array(z.string()).default([]), // transcript segments that are the wish: never quoted as the artist's words
  wishAt: z.string().optional(), // when the wish was last added to (a later answer starts it over)
  batchId: z.string().optional(), // the job in flight (batch or change): a job whose entry was reset meanwhile keeps nothing
  autoKey: z.string().optional(), // content + wish the last automatic batch was made from (never twice for the same)
  batchDay: z.string().default(""),
  batches: z.number().default(0), // proposal batches today (cost cap per profile)
  day: z.string().default(""), // YYYY-MM-DD of `requests`
  requests: z.number().default(0), // agent requests today (cost cap per profile)
});
export type LayoutEntry = z.infer<typeof Entry>;
type Store = Record<string, LayoutEntry>;

const file = () => path.join(dataDir(), "dossier-layouts.json");

export function readAll(): Store {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    return {};
  }
  const out: Store = {};
  if (raw && typeof raw === "object")
    for (const [id, v] of Object.entries(raw)) {
      const e = Entry.safeParse(v);
      if (e.success) out[id] = e.data;
      else console.error(`[dossier] dropping an unreadable saved layout for ${id}`);
    }
  return out;
}

export const emptyEntry = (): LayoutEntry => ({ enabled: false, history: [], proposals: [], shown: [], wishSegments: [], batchDay: "", batches: 0, day: "", requests: 0 });
export const readEntry = (profileId: string): LayoutEntry => readAll()[profileId] ?? emptyEntry();

export function saveEntry(profileId: string, entry: LayoutEntry): void {
  const store = readAll();
  store[profileId] = entry;
  write(store);
}

function write(store: Store) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 1));
  fs.renameSync(tmp, file());
}

export function forgetLayouts(profileIds: string[]): void {
  const store = readAll();
  let changed = false;
  for (const id of profileIds) if (id in store) (delete store[id], (changed = true));
  if (changed) write(store);
}
