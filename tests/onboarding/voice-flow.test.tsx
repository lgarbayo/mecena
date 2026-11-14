// @vitest-environment jsdom
/**
 * Spoken onboarding end to end with the REAL dictation hook and a scripted SpeechRecognition: the first answer, its
 * follow-up question, and a second answer that must still reach the queue and be sent ("worked for the first
 * question, then stopped").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FakeRecognition, installFakeSpeech } from "../voice/fakeSpeech";

const sent: string[] = [];
let hangNext = false;
vi.mock("@/lib/api-client", async () => {
  const svc = await import("@/features/onboarding/service");
  return {
    apiGet: async (url: string) => svc.getOnboardingState(new URL(url, "http://x").searchParams.get("profileId") ?? "demo-creator"),
    apiSend: async (_url: string, body: { text: string; source: "voice" | "text"; profileId?: string }, _m?: string, signal?: AbortSignal) => {
      if (hangNext) {
        hangNext = false;
        // A turn that never answers (cold schema compile, a cut proxy): only the client's timeout can end it.
        return new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      }
      sent.push(body.text);
      return svc.processTurn({ ...body, profileId: body.profileId ?? "demo-creator" });
    },
  };
});
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/onboarding" }));
vi.mock("@/components/shell/AppProvider", () => ({
  useApp: () => ({ profile: null, appUserId: "u", refresh: async () => undefined, setMode: async () => undefined }),
}));
// Same queue, test-sized clock (production: slow after 12 s, abort after 150 s).
vi.mock("@/features/onboarding/turnQueue", async (orig) => {
  const m = await orig<typeof import("@/features/onboarding/turnQueue")>();
  class TurnQueue extends m.TurnQueue {
    constructor(send: ConstructorParameters<typeof m.TurnQueue>[0], events: ConstructorParameters<typeof m.TurnQueue>[1]) {
      super(send, events, { timeoutMs: 1500, slowMs: 50 });
    }
  }
  return { ...m, TurnQueue };
});

const { StepOnboarding } = await import("@/features/onboarding/ui/StepOnboarding");
const { ONBOARDING } = await import("@/features/onboarding/copy");
const { VoiceOrb } = await import("@/features/onboarding/ui/VoiceOrb");

beforeEach(() => {
  installFakeSpeech();
  sent.length = 0;
  hangNext = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("spoken onboarding", () => {
  it("first answer -> follow-up question -> the person talks again: the second answer is sent too", async () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    expect(FakeRecognition.running).toHaveLength(1);

    // First answer; its request hangs: the screen says it is slow, then offers a retry instead of waiting forever.
    hangNext = true;
    act(() => FakeRecognition.latest.final("Me llamo Antía Varela y soy ilustradora de A Coruña."));
    await screen.findByText(ONBOARDING.slow);
    fireEvent.click(await screen.findByRole("button", { name: ONBOARDING.retry }, { timeout: 5000 }));
    // The follow-up question replaces the question as the main headline without the "Mecena pregunta" kicker
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/¿Qué serie o proyecto/), { timeout: 5000 });
    expect(sent).toEqual(["Me llamo Antía Varela y soy ilustradora de A Coruña."]);

    // While the follow-up is read, Chrome ends the silent session; the person pauses and talks again at once.
    act(() => FakeRecognition.latest.end());
    const old = FakeRecognition.latest;
    fireEvent.click(screen.getByTestId("orb")); // pause
    fireEvent.click(screen.getByTestId("orb")); // talk again before the old session has ended
    act(() => old.end());
    expect(FakeRecognition.running).toHaveLength(1);
    expect(screen.getByTestId("orb").getAttribute("aria-pressed")).toBe("true");

    act(() => FakeRecognition.latest.final("Busco una beca para producir una serie de grabados."));
    await waitFor(() => expect(sent).toEqual(["Me llamo Antía Varela y soy ilustradora de A Coruña.", "Busco una beca para producir una serie de grabados."]));
    await waitFor(() => expect(screen.queryByText(ONBOARDING.sending)).toBeNull());
  });

  it("the orb does not open a second microphone on phones (it would starve the dictation)", async () => {
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => undefined));
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    const ua = vi.spyOn(navigator, "userAgent", "get");

    ua.mockReturnValue("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
    const phone = render(<VoiceOrb active />);
    expect(getUserMedia).not.toHaveBeenCalled();
    phone.unmount();

    ua.mockReturnValue("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");
    render(<VoiceOrb active />);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("on iPhone each answer ends the session; 'Siguiente' reopens the microphone for the next question", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    );
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    act(() => {
      FakeRecognition.latest.final("Me llamo Antía Varela y soy ilustradora de A Coruña.");
      FakeRecognition.latest.end(); // iOS: single-shot session
    });
    expect(FakeRecognition.running).toHaveLength(0);
    for (let q = 2; q <= 3; q++) {
      fireEvent.click(screen.getByTestId("next"));
      expect(FakeRecognition.running).toHaveLength(1);
      act(() => {
        FakeRecognition.latest.final(`Respuesta ${q}: pinto marinas.`);
        FakeRecognition.latest.end();
      });
    }
    await waitFor(() => expect(sent).toEqual(["Me llamo Antía Varela y soy ilustradora de A Coruña.", "Respuesta 2: pinto marinas.", "Respuesta 3: pinto marinas."]), { timeout: 5000 });
  });

  it("on iPhone a session that stops hearing without ending: 'Siguiente' swaps it for a fresh one", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    );
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    act(() => FakeRecognition.latest.interim("Me llamo Antía Varela"));
    const stuck = FakeRecognition.latest; // still "listening", never ends, hears nothing more
    fireEvent.click(screen.getByTestId("next"));
    expect(FakeRecognition.latest).not.toBe(stuck);
    expect(FakeRecognition.latest.state).toBe("listening");
    // The stuck session's late final of the phrase flush() already handed out is ignored.
    act(() => stuck.final("Me llamo Antía Varela"));
    act(() => FakeRecognition.latest.final("Pinto marinas en Ferrol."));
    await waitFor(() => expect(sent).toEqual(["Me llamo Antía Varela", "Pinto marinas en Ferrol."]), { timeout: 5000 });
  });
});
