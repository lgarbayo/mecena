// @vitest-environment jsdom
// Coming back to /onboarding (e.g. "Editar respuestas del perfil" in the feed) must not wipe the profile unasked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Profile } from "@/contracts";
import { fixtureCreator } from "@/fixtures";

let stored: Profile = structuredClone(fixtureCreator);
const sent: { reset?: boolean }[] = [];
vi.mock("@/lib/api-client", () => ({
  apiGet: async () => ({ profile: stored, sections: [], transcript: [] }),
  apiSend: async (_url: string, body: { reset?: boolean }) => {
    sent.push(body);
    return { profile: stored, sections: [], changedProfileFields: [], changedSectionKeys: [] };
  },
}));
vi.mock("@/components/voice/useSpeechRecognition", () => ({
  MIC_BLOCKED: new Set(),
  useSpeechRecognition: () => ({ supported: false, listening: false, interim: "", error: null, start: vi.fn(), stop: vi.fn() }),
}));
vi.mock("@/features/works/client", () => ({ worksClient: { list: async () => [] } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/onboarding" }));
vi.mock("@/components/shell/AppProvider", () => ({
  useApp: () => ({ profile: stored, appUserId: "u", refresh: async () => undefined, setMode: async () => undefined }),
}));

const { StepOnboarding } = await import("@/features/onboarding/ui/StepOnboarding");

afterEach(() => {
  cleanup();
  sent.length = 0;
  stored = structuredClone(fixtureCreator);
});

async function answerFirstQuestion() {
  fireEvent.click(screen.getByTestId("choose-text"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Pinto marinas en Ferrol." } });
  fireEvent.click(screen.getByTestId("next"));
  await waitFor(() => expect(sent).toHaveLength(1));
}

describe("/onboarding with a profile already filled", () => {
  it("keeps the profile: says so, and the first answer does not reset it", async () => {
    render(<StepOnboarding />);
    await waitFor(() => expect(screen.getByTestId("resume-note").textContent).toMatch(/se suma a tu perfil/));
    await answerFirstQuestion();
    expect(sent[0]!.reset).toBe(false);
  });

  it("'Empezar de cero' warns what goes, then the first answer resets", async () => {
    render(<StepOnboarding />);
    fireEvent.click(await screen.findByTestId("restart"));
    expect(screen.getByTestId("resume-note").textContent).toMatch(/Borraremos.*Tus obras se quedan/);
    await answerFirstQuestion();
    expect(sent[0]!.reset).toBe(true);
  });

  it("changing your mind after 'Empezar de cero' keeps the profile", async () => {
    render(<StepOnboarding />);
    fireEvent.click(await screen.findByTestId("restart"));
    fireEvent.click(screen.getByTestId("keep-profile"));
    await answerFirstQuestion();
    expect(sent[0]!.reset).toBe(false);
  });

  it("a brand-new profile still starts clean, with no extra step", async () => {
    stored = { ...structuredClone(fixtureCreator), displayName: "", disciplines: [], bio: "", statement: "", achievements: [], education: [], links: [], fundingNeeds: [], city: undefined, province: undefined, region: undefined, territory: undefined, projectIdea: undefined, birthYear: undefined, languages: [] }; // as a fresh signup
    render(<StepOnboarding />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("resume-note")).toBeNull();
    await answerFirstQuestion();
    expect(sent[0]!.reset).toBe(true);
  });
});
