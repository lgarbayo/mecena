/** Browser calls for /obras (WP-02). Thin wrappers over the shared fetch helpers. */
import { API, type CropSuggestion, type MediaKind, type TechnicalSheet, type Work } from "@/contracts";
import { ApiClientError, apiGet, apiSend } from "@/lib/api-client";

export type WorkPatch = { sheet?: Partial<TechnicalSheet>; crop?: CropSuggestion; confirmed?: boolean; order?: number; mediaKind?: MediaKind; links?: string[] };

export const worksClient = {
  list: (profileId?: string) => apiGet<{ works: Work[] }>(profileId ? `${API.works}?profileId=${encodeURIComponent(profileId)}` : API.works).then((r) => r.works),
  create: (imageDataUrl: string, voiceDescription?: string, profileId?: string) =>
    apiSend<{ work: Work }>(API.works, { imageDataUrl, voiceDescription: voiceDescription || undefined, profileId }).then((r) => r.work),
  describe: (id: string, voiceDescription: string) => apiSend<{ work: Work }>(`${API.work(id)}/describe`, { voiceDescription }).then((r) => r.work),
  update: (id: string, patch: WorkPatch) =>
    apiSend<{ work: Work }>(API.work(id), patch, "PATCH").then((r) => r.work),
  move: (id: string, direction: -1 | 1) => apiSend<{ works: Work[] }>(`${API.work(id)}/move`, { direction }).then((r) => r.works),
  async remove(id: string): Promise<void> {
    const res = await fetch(API.work(id), { method: "DELETE" });
    if (!res.ok) throw new ApiClientError(res.status, "internal", "No hemos podido quitar la obra");
  },
};

export function errorText(e: unknown): string {
  if (e instanceof ApiClientError) return e.code === "network" ? "Sin conexión. Inténtalo de nuevo." : e.message;
  return e instanceof Error ? e.message : "Algo ha fallado. Inténtalo de nuevo.";
}
