// @vitest-environment jsdom
/**
 * /onboarding as it is served (StepOnboarding), creator mode: trust before the mic, the dossier growing live while the
 * person talks, the way out to typing, photos inside the conversation, and leaving only once everything is saved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Work } from "@/contracts";
import { fixtureTranscript } from "@/fixtures";

/** When set, the next turn waits for release() (a slow Claude). */
let hold: { promise: Promise<void>; release: () => void } | null = null;
const holdNext = () => {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  hold = { promise, release };
  return hold;
};

// Route the client's fetch helpers straight to the real server service (mock AI), so the UI is exercised end to end.
vi.mock("@/lib/api-client", async () => {
  const svc = await import("@/features/onboarding/service");
  return {
    apiGet: async (url: string) => {
      const u = new URL(url, "http://x");
      if (u.pathname === "/api/works") return { works: [] };
      return svc.getOnboardingState(u.searchParams.get("profileId") ?? "demo-creator");
    },
    apiSend: async (url: string, body: { text: string; source: "voice" | "text"; profileId?: string }) => {
      if (url === "/api/dossier/layout") return { busy: false, count: 2 };
      const h = hold;
      if (h) {
        hold = null;
        await h.promise;
      }
      return svc.processTurn({ ...body, profileId: body.profileId ?? "demo-creator" });
    },
  };
});
const speech = {
  supported: true,
  listening: false,
  interim: "",
  error: null as string | null,
  errorCode: null as string | null,
  tapToResume: false,
  ios: false,
  start: vi.fn(),
  stop: vi.fn(),
  flush: vi.fn(),
  restart: vi.fn(),
};
let onFinal: ((t: string) => void) | undefined;
vi.mock("@/components/voice/useSpeechRecognition", async (orig) => ({
  ...(await orig<typeof import("@/components/voice/useSpeechRecognition")>()),
  useSpeechRecognition: (o: { onFinal: (t: string) => void }) => {
    onFinal = o.onFinal;
    return speech;
  },
}));
const setMode = vi.fn(async (_k: string) => undefined);
vi.mock("@/components/shell/AppProvider", () => ({
  useApp: () => ({ profile: null, appUserId: "u", refresh: async () => undefined, setMode }),
  useOptionalApp: () => null,
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/onboarding" }));
// The works feature owns the camera flow: a stand-in that "takes" a photo and returns its work.
const photographed: Work = {
  id: "w-1",
  profileId: "demo-creator",
  imageUrl: "/x.jpg",
  sheet: { title: "Rederas", year: 2024, technique: "acuarela", dimensions: "30 × 40 cm" },
  sheetSource: "voice",
  confirmed: false,
  order: 0,
  createdAt: "2026-11-14T10:00:00.000Z",
};
vi.mock("@/features/works/CaptureWork", () => ({
  CaptureWork: ({ onCreated }: { onCreated(w: Work): void }) => (
    <button type="button" onClick={() => onCreated(photographed)}>
      Crear ficha
    </button>
  ),
}));
// jsdom has no SpeechRecognition: pretend the browser supports dictation
(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = function () {};

const { StepOnboarding } = await import("@/features/onboarding/ui/StepOnboarding");
const { ONBOARDING } = await import("@/features/onboarding/copy");
const { STEPS_COPY } = await import("@/features/onboarding/steps");

beforeEach(() => {
  hold = null;
  Object.assign(speech, { listening: false, interim: "", error: null, errorCode: null, tapToResume: false });
  speech.start.mockClear();
  speech.stop.mockClear();
  speech.restart.mockClear();
  push.mockClear();
  setMode.mockReset();
  setMode.mockImplementation(async () => undefined);
});
afterEach(cleanup);

describe("/onboarding (creator)", () => {
  it("shows the trust strip and the voice privacy note before the mic", () => {
    render(<StepOnboarding />);
    const trust = screen.getByTestId("trust-strip");
    const mic = screen.getByTestId("choose-voice");
    expect(trust.compareDocumentPosition(mic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trust.textContent).toContain("El arte es tuyo; nosotros hacemos el papeleo.");
    expect(within(mic).getByTestId("mic-note").textContent).toBe(ONBOARDING.micNote);
    expect(ONBOARDING.micNote).toContain("Google");
  });

  it("voice chunks grow the profile and the dossier on screen, section by section, next to the transcript", async () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    const live = screen.getByTestId("live-dossier");
    expect(live.querySelectorAll("[data-filled]")).toHaveLength(0);
    act(() => {
      for (const seg of fixtureTranscript) onFinal!(seg.text);
    });
    await waitFor(() => expect(within(live).getByText("Antía Varela")).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(live.querySelectorAll("[data-filled]").length).toBeGreaterThanOrEqual(3));
    expect(live.textContent).toContain("A Coruña");
    expect(screen.getByTestId("live-latest").textContent?.length).toBeGreaterThan(10);
    expect(screen.getByTestId("live-count").textContent).toMatch(/^[3-6]\/6$/);
    // The transcript shows every word said, each line with its save state.
    const transcript = screen.getByTestId("transcript");
    for (const seg of fixtureTranscript) expect(transcript.textContent).toContain(seg.text);
    await waitFor(() => expect([...transcript.querySelectorAll("li")].every((li) => li.getAttribute("data-status") === "done")).toBe(true));
    // "Ver entero" opens every section and the full profile.
    fireEvent.click(screen.getByTestId("live-open"));
    const sheet = screen.getByRole("dialog");
    expect(sheet.querySelectorAll("[data-section]").length).toBe(6);
    expect(sheet.textContent).toContain("Antía Varela");
  });

  it("'Prefiero escribir' switches to typing on the same step and keeps what was said", async () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    fireEvent.click(screen.getByTestId("next"));
    act(() => onFinal!("Pinto con acuarela y tinta."));
    fireEvent.click(screen.getByTestId("prefer-text"));
    expect(speech.stop).toHaveBeenCalled();
    expect(screen.getByText("Paso 2 de 6")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /Qué haces/ })).toBeTruthy();
    expect(screen.getByTestId("transcript").textContent).toContain("Pinto con acuarela y tinta.");
    fireEvent.click(screen.getByTestId("prefer-voice"));
    expect(speech.restart).toHaveBeenCalledTimes(1); // "Siguiente" opens a fresh session for the next question
    expect(speech.start).toHaveBeenCalledTimes(2); // choose-voice, prefer-voice
  });

  it("without microphone access it moves to typing by itself, with a kind notice", () => {
    const view = render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    Object.assign(speech, { errorCode: "not-allowed", error: ONBOARDING.micDenied });
    view.rerender(<StepOnboarding />);
    expect(screen.getByTestId("mic-notice").textContent).toBe(ONBOARDING.micDenied);
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.queryByTestId("orb")).toBeNull();
    expect(screen.queryByTestId("prefer-voice")).toBeNull(); // voice cannot work here
    expect(screen.getByText("Paso 1 de 6")).toBeTruthy();
  });

  it("a photographed work appears in the live dossier with its sheet, without leaving the conversation", () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    speech.listening = true;
    fireEvent.click(screen.getByTestId("photo-work"));
    expect(speech.stop).toHaveBeenCalled(); // one microphone at a time
    const sheet = screen.getByTestId("photo-sheet");
    fireEvent.click(within(sheet).getByText("Crear ficha"));
    fireEvent.click(within(sheet).getByRole("button", { name: STEPS_COPY.close }));
    expect(screen.queryByTestId("photo-sheet")).toBeNull();
    expect(speech.start).toHaveBeenCalledTimes(2); // it was listening: carries on
    expect(screen.getByTestId("live-works").textContent).toContain("Rederas · 2024 · acuarela · 30 × 40 cm");
    expect(screen.getByText("Paso 1 de 6")).toBeTruthy();
  });

  it("a follow-up question from an earlier step never shows on the next one", async () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    const h = holdNext();
    act(() => onFinal!("Me llamo Antía Varela."));
    fireEvent.click(screen.getByTestId("next"));
    await act(async () => {
      h.release();
      await new Promise((r) => setTimeout(r, 50));
    });
    await waitFor(() => expect(screen.getByTestId("live-dossier").textContent).toContain("Antía Varela"));
    expect(screen.queryByTestId("follow-up")).toBeNull();
    expect(screen.getByText(/Rederas|acuarela/)).toBeTruthy(); // step 2 example still shown
  });

  it("leaving from the last screen waits until the last answer is saved", async () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-voice"));
    const h = holdNext();
    act(() => onFinal!("Me llamo Antía Varela y soy ilustradora de A Coruña."));
    for (let i = 1; i <= 6; i++) fireEvent.click(screen.getByTestId("next"));
    fireEvent.click(screen.getByTestId("finish-cta"));
    expect(screen.getByTestId("leaving").textContent).toContain(STEPS_COPY.saving);
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("exit"));
    expect(push).not.toHaveBeenCalled();
    await act(async () => h.release());
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("with nothing pending the finish CTA is a plain link to the works", async () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-text"));
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByTestId("next"));
    const cta = screen.getByTestId("finish-cta");
    expect(cta.getAttribute("href")).toBe("/obras");
    expect(cta.textContent).toBe("Fotografiar mi obra");
    fireEvent.click(cta);
    expect(screen.queryByTestId("leaving")).toBeNull();
  });

  it("a musician gets the same /obras step, worded for concerts and recordings", async () => {
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("choose-text"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Me llamo Iria Souto, soy violinista y compositora de Vigo." } });
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByTestId("next"));
    const cta = screen.getByTestId("finish-cta");
    await waitFor(() => expect(cta.textContent).toBe("Subir fotos y enlaces"), { timeout: 5000 });
    expect(cta.getAttribute("href")).toBe("/obras");
  });

  it("the creator/pyme switch waits for the change and reports a failure", async () => {
    let finish!: () => void;
    setMode.mockImplementation(() => new Promise<undefined>((r) => (finish = () => r(undefined))));
    render(<StepOnboarding />);
    fireEvent.click(screen.getByTestId("kind-business"));
    expect(screen.getByTestId("kind-creator").hasAttribute("disabled")).toBe(true);
    expect((screen.getByTestId("choose-voice") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("choose-text") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish());
    expect((screen.getByTestId("choose-text") as HTMLButtonElement).disabled).toBe(false);

    setMode.mockImplementation(async () => {
      throw new Error("offline");
    });
    fireEvent.click(screen.getByTestId("kind-business"));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", STEPS_COPY.switchFailed);
  });
});
