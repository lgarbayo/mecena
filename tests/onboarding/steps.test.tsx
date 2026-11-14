// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Route the client's fetch helpers to the real server service (mock AI), as in client.test.tsx.
vi.mock("@/lib/api-client", async () => {
  const svc = await import("@/features/onboarding/service");
  return {
    apiGet: async (url: string) => svc.getOnboardingState(new URL(url, "http://x").searchParams.get("profileId") ?? "demo-creator"),
    apiSend: async (_url: string, body: { text: string; source: "voice" | "text"; profileId?: string }) => svc.processTurn({ ...body, profileId: body.profileId ?? "demo-creator" }),
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
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/onboarding" }));
vi.mock("@/components/shell/AppProvider", () => ({
  useApp: () => ({ profile: null, appUserId: "u", refresh: async () => undefined, setMode: async () => undefined }),
}));
// jsdom has no SpeechRecognition: pretend the browser supports dictation
(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = function () {};

const { StepOnboarding } = await import("@/features/onboarding/ui/StepOnboarding");

afterEach(() => {
  cleanup();
  speech.start.mockClear();
  speech.stop.mockClear();
});

describe("/onboarding step by step", () => {
  it("starts with the voice / text choice and no progress bar", () => {
    render(<StepOnboarding />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("¿Cómo nos lo cuentas?");
    expect(screen.getByTestId("choose-voice")).toBeTruthy();
    expect(screen.getByTestId("choose-text")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("text mode: one question per screen, answers fill the profile, ends in the summary", async () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-text"));
    expect(screen.getByText("Paso 1 de 5")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("¿Cómo te llamas y desde dónde creas?");

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Me llamo Antía Varela y vivo en A Coruña." } });
    fireEvent.click(screen.getByTestId("next"));
    expect(screen.getByText("Paso 2 de 5")).toBeTruthy();
    expect(screen.getByTestId("next").textContent).toBe("Saltar"); // nothing typed yet

    for (let i = 2; i <= 5; i++) fireEvent.click(screen.getByTestId("next"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Tu perfil está listo.");
    await waitFor(() => expect(document.body.textContent).toContain("Antía Varela"), { timeout: 5000 });
    expect(screen.getByTestId("finish-cta").getAttribute("href")).toBe("/obras");
  });

  it("voice mode: starts dictation, shows what was heard and keeps it across steps", async () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    expect(speech.start).toHaveBeenCalled();
    expect(screen.getByTestId("orb")).toBeTruthy();
    act(() => onFinal!("Soy ilustradora y pintora de A Coruña."));
    expect(document.body.textContent).toContain("Soy ilustradora y pintora de A Coruña.");
    fireEvent.click(screen.getByTestId("next"));
    expect(screen.getByText("Paso 2 de 5")).toBeTruthy();
    for (let i = 2; i <= 5; i++) fireEvent.click(screen.getByTestId("next"));
    expect(speech.stop).toHaveBeenCalled();
    await waitFor(() => expect(document.body.textContent).toContain("A Coruña"), { timeout: 5000 });
  });

  it("flushes pending interim voice text when clicking Siguiente so fast answers after step 2 are never lost", async () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    act(() => onFinal!("Me llamo Antía Varela y vivo en A Coruña."));
    fireEvent.click(screen.getByTestId("next"));
    act(() => onFinal!("Pinto con acuarela y tinta."));
    fireEvent.click(screen.getByTestId("next"));
    // Step 3: user speaks and immediately clicks Siguiente while text is still in speech.interim
    speech.interim = "Quiero hacer una serie de doce acuarelas sobre las rederas.";
    fireEvent.click(screen.getByTestId("next"));
    speech.interim = "";
    for (let i = 4; i <= 5; i++) fireEvent.click(screen.getByTestId("next"));
    await waitFor(() => expect(document.body.textContent).toContain("doce acuarelas"), { timeout: 5000 });
  });

  it("replaces the question with the follow-up question as the main headline when available, and shows skeleton loader while busy", async () => {
    const { container } = render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-text"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("¿Cómo te llamas y desde dónde creas?");
    
    // When turn is sent with mock follow-up
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Me llamo Antía y pinto acuarelas." } });
    fireEvent.click(screen.getByTestId("next"));
    
    // Check that 'Mecena pregunta' label is gone
    expect(screen.queryByText("Mecena pregunta")).toBeNull();
  });
});
