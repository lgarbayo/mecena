// @vitest-environment jsdom
/** Free plan feed: the matches beyond the quota show their score, the call itself stays blurred behind the paywall. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { CallsResponse } from "@/contracts/api";
import { fixtureCalls, fixtureCreator } from "@/fixtures";

let feed: CallsResponse;
vi.mock("@/lib/api-client", () => ({
  apiGet: async (url: string) => (url.startsWith("/api/calls?") ? feed : { status: "idle", results: [], discarded: 0, runsLeft: 0 }),
  apiSend: async () => ({}),
  ApiClientError: class extends Error {},
}));
vi.mock("@/components/shell/AppProvider", () => ({ useApp: () => ({ profile: fixtureCreator, appUserId: "u" }), useOptionalApp: () => null }));
vi.mock("@/features/purchases/ui/Paywall", () => ({ Paywall: ({ open }: { open: boolean }) => (open ? <div data-testid="paywall" /> : null) }));

const { CallsFeed } = await import("@/features/matching/ui/CallsFeed");

afterEach(cleanup);

const call = fixtureCalls[0];
const visible = { call, match: { callId: call.id, profileId: fixtureCreator.id, score: 88, eligible: true, whyYouFit: ["Encajas"], whatYouMiss: [], generatedBy: "rules" as const } };

function setFeed(lockedScores: number[] | undefined, lockedCount = lockedScores?.length ?? 0) {
  feed = {
    results: [visible],
    lockedCount,
    ...(lockedScores ? { lockedScores } : {}),
    editions: [],
    mode: "creator",
    pro: false,
    diagnostics: {
      totalEvaluated: 10,
      discardedByEligibility: 2,
      discardedByDiscipline: 3,
      matchedCount: 1 + lockedCount,
      profileSummary: { kind: "creator", isComplete: true, disciplines: [], fundingNeeds: [], location: "" },
    },
  } as unknown as CallsResponse;
}

describe("locked cards on the free plan", () => {
  it("show each locked match's score and fit, never its title, and open the paywall", async () => {
    setFeed([81, 60, 40]);
    render(<CallsFeed />);
    const cards = await screen.findAllByTestId("locked-banner");
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => within(c).getByTestId("locked-score").textContent)).toEqual(["81alto", "60medio", "40bajo"]);
    expect(cards[0].getAttribute("aria-label")).toContain("81 de 100");
    expect(cards.some((c) => c.textContent?.includes(call.title))).toBe(false);
    fireEvent.click(cards[0]);
    expect(screen.getByTestId("paywall")).toBeTruthy();
  });

  it("'Encaje alto' keeps only the locked matches with a high score", async () => {
    setFeed([81, 60, 40]);
    render(<CallsFeed />);
    await screen.findAllByTestId("locked-banner");
    fireEvent.click(screen.getByRole("button", { name: "Encaje alto" }));
    expect(screen.getAllByTestId("locked-banner")).toHaveLength(1);
  });

  it("an older feed without scores still shows the locked cards, without a score", async () => {
    setFeed(undefined, 2);
    render(<CallsFeed />);
    expect(await screen.findAllByTestId("locked-banner")).toHaveLength(2);
    expect(screen.queryByTestId("locked-score")).toBeNull();
  });
});
