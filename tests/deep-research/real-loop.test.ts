// The real deep-research slice with a scripted Anthropic client (no network): pause_turn handling and the caps.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureCreator } from "@/fixtures";

const create = vi.fn();
vi.mock("@/server/ai/llm", async (orig) => ({
  ...(await orig<typeof import("@/server/ai/llm")>()),
  anthropic: () => ({ beta: { messages: { create } } }),
  modelFor: () => "claude-opus-5-5",
}));

const { deepResearchAi } = await import("@/features/deep-research/ai");

const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const searched = (n: number, url: string) =>
  Array.from({ length: n }, (_, i) => [
    { type: "server_tool_use", id: `s${i}`, name: "web_search", input: { query: "premio" } },
    { type: "web_search_tool_result", tool_use_id: `s${i}`, content: [{ type: "web_search_result", url, title: "t", encrypted_content: "x", page_age: null }] },
  ]).flat();
const answer = JSON.stringify({
  candidates: [
    { title: "Premio X", organizer: "Fundación X", type: "premio", url: "https://fundacionx.org/premio", deadline: "2099-01-01", deadlineText: "", amountText: "1.000 €", summary: "s", disciplines: [], beneficiaryKinds: ["creator"], region: null, requirements: [] },
  ],
});
const input = { profile: fixtureCreator, today: "2026-11-14", maxSearches: 8, maxOutputTokens: 4000, maxTotalTokens: 250_000 };

beforeEach(() => create.mockReset());

describe("deep research loop against a scripted API", () => {
  it("one request that ends normally: 4 searches allowed, JSON parsed, sources collected", async () => {
    create.mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [...searched(3, "https://fundacionx.org/a"), { type: "text", text: answer }] });
    const r = await deepResearchAi.real.deepResearch(input);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].tools).toEqual([expect.objectContaining({ type: "web_search_20260209", max_uses: 4 })]);
    expect(r.searches).toBe(3);
    expect(r.sourceUrls).toEqual(["https://fundacionx.org/a"]);
    expect(r.candidates[0].title).toBe("Premio X");
  });

  it("resumes a paused turn with identical tools, then forces an answer without searches when still paused", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "pause_turn", usage, content: searched(4, "https://fundacionx.org/a") })
      .mockResolvedValueOnce({ stop_reason: "pause_turn", usage, content: searched(4, "https://fundacionx.org/b") })
      .mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: answer }] });
    const r = await deepResearchAi.real.deepResearch(input);
    expect(create).toHaveBeenCalledTimes(3);
    const calls = create.mock.calls.map((c) => c[0]);
    expect(calls[1].tools).toEqual(calls[0].tools); // never edited after a paused turn
    expect(calls[2].tools).toEqual(calls[0].tools);
    expect(calls[0].tool_choice).toBeUndefined();
    expect(calls[2].tool_choice).toEqual({ type: "none" }); // the last one only writes the answer
    expect(calls[2].messages.filter((m: { role: string }) => m.role === "assistant")).toHaveLength(2);
    expect(r.searches).toBe(8); // = maxSearches: 4 per request, 2 requests that may search
    expect(r.candidates).toHaveLength(1);
  });

  it("a refusal or an unparseable empty answer fails the run", async () => {
    create.mockResolvedValueOnce({ stop_reason: "refusal", usage, content: [] });
    await expect(deepResearchAi.real.deepResearch(input)).rejects.toThrow(/declined/);
    create.mockResolvedValueOnce({ stop_reason: "end_turn", usage, content: [{ type: "text", text: "   " }] });
    await expect(deepResearchAi.real.deepResearch(input)).rejects.toThrow(/Unparseable/);
  });
});
