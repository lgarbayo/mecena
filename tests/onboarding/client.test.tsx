// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { fixtureTranscript } from "@/fixtures";

// Route the client's fetch helpers straight to the real server service (mock AI), so the UI is exercised end to end.
vi.mock("@/lib/api-client", async () => {
  const svc = await import("@/features/onboarding/service");
  return {
    apiGet: async (url: string) => svc.getOnboardingState(new URL(url, "http://x").searchParams.get("profileId") ?? undefined),
    apiSend: async (_url: string, body: { text: string; source: "voice" | "text"; profileId?: string }) => svc.processTurn(body),
  };
});
const speech = { supported: true, listening: false, interim: "", error: null as string | null, start: vi.fn(), stop: vi.fn() };
let onFinal: ((t: string) => void) | undefined;
vi.mock("@/components/voice/useSpeechRecognition", () => ({
  useSpeechRecognition: (o: { onFinal: (t: string) => void }) => {
    onFinal = o.onFinal;
    return speech;
  },
}));
vi.mock("@/components/shell/AppProvider", () => ({
  useApp: () => ({ profile: null, appUserId: "u", refresh: async () => undefined, setMode: async () => undefined }),
}));

const { OnboardingClient } = await import("@/features/onboarding/ui/OnboardingClient");

afterEach(cleanup);

describe("/onboarding client", () => {
  it("shows the trust strip before the mic button", async () => {
    render(<OnboardingClient />);
    const trust = screen.getByTestId("trust-strip");
    const mic = await screen.findByTestId("mic-button");
    expect(trust.compareDocumentPosition(mic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trust.textContent).toContain("El arte es tuyo; nosotros hacemos el papeleo.");
  });

  it("voice chunks fill the profile and dossier live, then offers the creator CTA", async () => {
    render(<OnboardingClient />);
    await screen.findByTestId("mic-button");
    act(() => {
      for (const seg of fixtureTranscript) onFinal!(seg.text);
    });
    await waitFor(() => expect(document.body.textContent).toContain("Antía Varela"), { timeout: 5000 });
    await waitFor(() => expect(screen.getByTestId("transcript").querySelectorAll("li")).toHaveLength(3));
    expect(document.body.textContent).toContain("A Coruña");
    await waitFor(() => expect(screen.getByTestId("finish-cta").getAttribute("href")).toBe("/obras"));
  });

  it("typed text works as a fallback input", async () => {
    render(<OnboardingClient />);
    const box = await screen.findByPlaceholderText(/Escribe aquí/);
    fireEvent.change(box, { target: { value: "Me llamo Antía Varela y vivo en A Coruña." } });
    fireEvent.submit(box.closest("form")!);
    await waitFor(() => expect(document.body.textContent).toContain("Antía Varela"));
  });
});
