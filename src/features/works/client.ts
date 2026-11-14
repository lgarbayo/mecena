/** Browser calls for /obras (WP-02). Thin wrappers over the shared fetch helpers. */
import { API, type CropSuggestion, type MediaKind, type TechnicalSheet, type Work } from "@/contracts";
import { ApiClientError, apiGet, apiSend, IDEMPOTENCY_HEADER, newIdempotencyKey } from "@/lib/api-client";

export type WorkPatch = { sheet?: Partial<TechnicalSheet>; crop?: CropSuggestion; confirmed?: boolean; order?: number; mediaKind?: MediaKind; links?: string[] };

export const worksClient = {
  list: (profileId?: string) => apiGet<{ works: Work[] }>(profileId ? `${API.works}?profileId=${encodeURIComponent(profileId)}` : API.works).then((r) => r.works),
  /**
   * `describe: false` stores the photo only; the sheet then comes from `describe` (one vision call per work).
   * `idempotencyKey`: one per photo, reused on retry, so a double tap or a retried upload never makes two works.
   */
  create: (imageDataUrl: string, voiceDescription?: string, profileId?: string, opts: { describe?: boolean; idempotencyKey?: string } = {}) =>
    apiSend<{ work: Work }>(API.works, { imageDataUrl, voiceDescription: voiceDescription || undefined, profileId, describe: opts.describe }, "POST", undefined, {
      idempotencyKey: opts.idempotencyKey,
    }).then((r) => r.work),
  describe: (id: string, voiceDescription?: string, idempotencyKey?: string) =>
    apiSend<{ work: Work }>(`${API.work(id)}/describe`, { voiceDescription: voiceDescription?.trim() || undefined }, "POST", undefined, { idempotencyKey }).then(
      (r) => r.work,
    ),
  update: (id: string, patch: WorkPatch, idempotencyKey?: string) =>
    apiSend<{ work: Work }>(API.work(id), patch, "PATCH", undefined, { idempotencyKey }).then((r) => r.work),
  move: (id: string, direction: -1 | 1, idempotencyKey?: string) =>
    apiSend<{ works: Work[] }>(`${API.work(id)}/move`, { direction }, "POST", undefined, { idempotencyKey }).then((r) => r.works),
  async remove(id: string, idempotencyKey: string = newIdempotencyKey()): Promise<void> {
    const res = await fetch(API.work(id), { method: "DELETE", headers: { [IDEMPOTENCY_HEADER]: idempotencyKey } });
    // 404: already gone (e.g. a retried delete) - that is what the artist asked for.
    if (!res.ok && res.status !== 404) throw new ApiClientError(res.status, "internal", "No hemos podido quitar la obra");
  },
};

export function errorText(e: unknown): string {
  if (e instanceof ApiClientError) return e.code === "network" ? "Sin conexión. Inténtalo de nuevo." : e.message;
  return e instanceof Error ? e.message : "Algo ha fallado. Inténtalo de nuevo.";
}
