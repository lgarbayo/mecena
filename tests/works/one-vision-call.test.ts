import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createRoute } from "@/app/api/works/route";
import { PATCH as patchRoute } from "@/app/api/works/[id]/route";
import { POST as describeRoute } from "@/app/api/works/[id]/describe/route";
import type { Work } from "@/contracts";
import { MOCK_CROP, worksAi } from "@/features/works/ai";
import { ctx, req, loginDemo } from "../helpers";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const IDENTITY = { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 };

async function create(body: Record<string, unknown>): Promise<Work> {
  const r = await createRoute(req("/api/works", { body: { imageDataUrl: PNG, ...body } }));
  expect(r.status).toBe(201);
  return (await r.json()).work;
}
async function describeIt(id: string, voiceDescription?: string): Promise<Work> {
  const r = await describeRoute(req(`/api/works/${id}/describe`, { body: voiceDescription ? { voiceDescription } : {} }), ctx({ id }));
  expect(r.status).toBe(200);
  return (await r.json()).work;
}
const patch = async (id: string, body: Record<string, unknown>): Promise<Work> =>
  (await (await patchRoute(req(`/api/works/${id}`, { method: "PATCH", body }), ctx({ id }))).json()).work;

beforeEach(async () => {
  await loginDemo();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("one vision call per work (capture flow)", () => {
  it("create with describe:false stores the photo without AI; describe makes the single call (sheet + crop)", async () => {
    const vision = vi.spyOn(worksAi.mock, "describeWork");
    const stored = await create({ describe: false });
    expect(vision).not.toHaveBeenCalled();
    expect(stored.analysis).toBe("pending");
    expect(stored.sheet.title).toBe("Sin título");
    expect(stored.crop).toBeUndefined();

    const w = await describeIt(stored.id, "Se llama Redeira II, acuarela de 2025");
    expect(vision).toHaveBeenCalledTimes(1);
    expect(vision.mock.calls[0][0].imageBase64).not.toBe(""); // the photo goes with the note, once
    expect(w.sheet).toMatchObject({ title: "Redeira II", year: 2025 });
    // The crop of that one call is kept (it used to be discarded with `w.crop ?? r.crop`).
    expect(w.crop).toEqual(MOCK_CROP);
    expect(w.suggestedCrop).toEqual(MOCK_CROP);
    expect(w.analysis).toBe("ok");
  });

  it("describe also works with no note at all (photo only)", async () => {
    const stored = await create({ describe: false });
    const w = await describeIt(stored.id);
    expect(w.sheet.title).toBe("Sin título");
    expect(w.crop).toEqual(MOCK_CROP);
  });

  it("create with a note (MCP/agent) does sheet + crop in that same single call", async () => {
    const vision = vi.spyOn(worksAi.mock, "describeWork");
    const w = await create({ voiceDescription: "Se llama Faro, óleo" });
    expect(vision).toHaveBeenCalledTimes(1);
    expect(w.sheet.title).toBe("Faro");
    expect(w.crop).toEqual(MOCK_CROP);
  });

  it("a crop the artist removed by hand survives a new reading, and can be restored", async () => {
    const w = await describeIt((await create({ describe: false })).id, "Se llama Faro");
    const removed = await patch(w.id, { crop: IDENTITY });
    expect(removed.crop).toEqual(IDENTITY);
    expect(removed.suggestedCrop).toEqual(MOCK_CROP); // kept apart: "Restaurar recorte"
    const again = await describeIt(w.id, "Se llama Faro, de 2024");
    expect(again.crop).toEqual(IDENTITY);
    const restored = await patch(w.id, { crop: again.suggestedCrop });
    expect(restored.crop).toEqual(MOCK_CROP);
  });

  it("a new reading replaces the old concept instead of merging it", async () => {
    const w = await describeIt((await create({ describe: false })).id, "Se llama Faro. Habla de la luz que guía a los que vuelven.");
    expect(w.sheet.concept).toBeTruthy();
    const again = await describeIt(w.id, "Se llama Faro, de 2024");
    expect(again.sheet.concept).toBeUndefined();
  });

  it("a failed vision call is recorded so /obras can say the photo was not analysed", async () => {
    vi.spyOn(worksAi.mock, "describeWork").mockResolvedValueOnce({ sheet: { title: "Faro" }, crop: IDENTITY, confidence: 0.3, fallback: true });
    const w = await describeIt((await create({ describe: false })).id, "Se llama Faro");
    expect(w.analysis).toBe("failed");
    expect(w.crop).toEqual(IDENTITY);
  });

  it("the same photo uploaded twice while waiting for its reading is one work, not two", async () => {
    const first = await create({ describe: false });
    const again = await create({ describe: false });
    expect(again.id).toBe(first.id);
    // Once read, the same bytes make a new work (the artist may photograph a piece again on purpose).
    await describeIt(first.id);
    const next = await create({ describe: false });
    expect(next.id).not.toBe(first.id);
    await describeIt(next.id);
  });

  it("rejects notes over 4000 characters with 400", async () => {
    const stored = await create({ describe: false });
    const r = await describeRoute(req(`/api/works/${stored.id}/describe`, { body: { voiceDescription: "a".repeat(4001) } }), ctx({ id: stored.id }));
    expect(r.status).toBe(400);
  });
});
