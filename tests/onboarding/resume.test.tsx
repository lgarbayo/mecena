// @vitest-environment jsdom
// Coming back to /onboarding (e.g. "Editar respuestas del perfil" in the feed) must not wipe the profile unasked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Profile } from "@/contracts";
import { fixtureCreator } from "@/fixtures";

let stored: Profile = structuredClone(fixtureCreator);
const sent: { reset?: boolean }[] = [];
const calls: { url: string; method?: string; body: Record<string, unknown> }[] = [];
vi.mock("@/lib/api-client", () => ({
  apiGet: async () => ({ profile: stored, sections: [], transcript: [] }),
  apiSend: async (url: string, body: Record<string, unknown>, method?: string) => {
    calls.push({ url, method, body });
    if (url === "/api/onboarding/reset") {
      stored = { ...stored, displayName: "", city: undefined, disciplines: [] };
      return { profile: stored, sections: [], transcript: [] };
    }
    if (url === "/api/profile") {
      stored = { ...stored, ...(body.patch as Partial<Profile>) };
      return { profile: stored };
    }
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
  calls.length = 0;
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
    expect(screen.getByTestId("live-dossier").textContent).toContain(fixtureCreator.city!);
  });

  it("'Empezar de cero' warns what goes, then wipes it as soon as the interview starts", async () => {
    render(<StepOnboarding />);
    fireEvent.click(await screen.findByTestId("restart"));
    expect(screen.getByTestId("resume-note").textContent).toMatch(/Borraremos.*Tus obras se quedan/);
    fireEvent.click(screen.getByTestId("choose-text"));
    // Before any answer: the server reset is on its way and the old profile is gone from the screen.
    expect(calls.map((c) => c.url)).toEqual(["/api/onboarding/reset"]);
    expect(screen.getByTestId("live-dossier").textContent).not.toContain(fixtureCreator.city!);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Pinto marinas en Ferrol." } });
    fireEvent.click(screen.getByTestId("next"));
    await waitFor(() => expect(sent).toHaveLength(1));
  });

  it("a value read wrong can be corrected by hand in the full sheet", async () => {
    render(<StepOnboarding />);
    fireEvent.click(await screen.findByTestId("choose-text"));
    fireEvent.click(screen.getByTestId("live-open"));
    fireEvent.click(await screen.findByTestId("edit-open-city"));
    fireEvent.change(screen.getByLabelText(/ciudad|municipio/i), { target: { value: "A Coruña" } });
    fireEvent.submit(screen.getByTestId("edit-city"));
    await waitFor(() => expect(calls.find((c) => c.url === "/api/profile")).toBeTruthy());
    const patch = calls.find((c) => c.url === "/api/profile")!;
    expect(patch).toMatchObject({ method: "PATCH", body: { patch: { city: "A Coruña" }, replace: true } });
    await waitFor(() => expect(screen.queryByTestId("edit-city")).toBeNull());
    expect(screen.getByTestId("live-sheet").textContent).toContain("A Coruña");
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
