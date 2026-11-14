// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { FakeRecognition, installFakeSpeech } from "./fakeSpeech";

beforeEach(installFakeSpeech);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  const finals: string[] = [];
  const hook = renderHook(() => useSpeechRecognition({ onFinal: (t) => finals.push(t) }));
  return { finals, hook, get speech() { return hook.result.current; } };
}

describe("useSpeechRecognition", () => {
  it("keeps dictating across the browser's silence timeouts: every final reaches onFinal", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Soy ilustradora de A Coruña."));
    act(() => FakeRecognition.latest.end()); // Chrome stops after a silence while the follow-up question is read
    expect(t.speech.listening).toBe(true);
    expect(FakeRecognition.running).toHaveLength(1);
    act(() => FakeRecognition.latest.final("Busco una beca de producción."));
    expect(t.finals).toEqual(["Soy ilustradora de A Coruña.", "Busco una beca de producción."]);
  });

  it("pause and talk again before the old session has ended: one live session, the second answer still arrives", () => {
    const t = setup();
    act(() => t.speech.start());
    const first = FakeRecognition.latest;
    act(() => first.final("Me llamo Antía."));
    act(() => t.speech.stop()); // tap to pause: Chrome ends the session a moment later
    act(() => t.speech.start()); // tap to talk again right away
    act(() => first.end()); // the old session's late onend must not restart it
    expect(FakeRecognition.running).toHaveLength(1);
    expect(t.speech.listening).toBe(true);
    act(() => FakeRecognition.latest.final("Vivo en Vigo."));
    expect(t.finals).toEqual(["Me llamo Antía.", "Vivo en Vigo."]);
  });

  it("start() while a session is still running reuses it instead of opening a second one", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => t.speech.start());
    expect(FakeRecognition.running).toHaveLength(1);
    act(() => FakeRecognition.running[0].final("hola"));
    expect(t.finals).toEqual(["hola"]);
  });

  it("a session that ends and cannot restart says so instead of pretending to listen", () => {
    const t = setup();
    act(() => t.speech.start());
    const r = FakeRecognition.latest;
    // Chrome sometimes reports the old session as still running when onend fires (InvalidStateError on restart).
    vi.spyOn(FakeRecognition.prototype, "start").mockImplementation(() => {
      throw new DOMException("recognition has already started", "InvalidStateError");
    });
    expect(() => act(() => r.end())).not.toThrow();
    vi.mocked(FakeRecognition.prototype.start).mockRestore();
    expect(t.speech.listening).toBe(false);
    act(() => t.speech.start()); // the next tap works
    expect(t.speech.listening).toBe(true);
    act(() => FakeRecognition.latest.final("otra vez"));
    expect(t.finals).toEqual(["otra vez"]);
  });

  it.each(["not-allowed", "service-not-allowed", "audio-capture", "network"])("a fatal '%s' error stops instead of restarting in a loop", (code) => {
    const t = setup();
    act(() => t.speech.start());
    const r = FakeRecognition.latest;
    act(() => {
      r.error(code);
      r.end();
    });
    expect(r.starts).toBe(1);
    expect(FakeRecognition.running).toHaveLength(0);
    expect(t.speech.listening).toBe(false);
    expect(t.speech.error).toBeTruthy();
  });

  it("transient 'no-speech' and 'aborted' keep listening", () => {
    const t = setup();
    act(() => t.speech.start());
    for (const code of ["no-speech", "aborted"]) {
      act(() => {
        FakeRecognition.latest.error(code);
        FakeRecognition.latest.end();
      });
    }
    expect(t.speech.listening).toBe(true);
    expect(FakeRecognition.running).toHaveLength(1);
    act(() => FakeRecognition.latest.final("sigo aquí"));
    expect(t.finals).toEqual(["sigo aquí"]);
  });

  it("Android re-sending earlier finals (resultIndex 0) does not duplicate turns", () => {
    const t = setup();
    act(() => t.speech.start());
    const r = FakeRecognition.latest;
    act(() => r.final("Hago cerámica."));
    act(() => r.resendAll());
    act(() => r.final("Busco una residencia."));
    act(() => r.resendAll());
    expect(t.finals).toEqual(["Hago cerámica.", "Busco una residencia."]);
  });

  it("stop() really stops: a late onend does not restart", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => t.speech.stop());
    act(() => FakeRecognition.latest.end());
    expect(FakeRecognition.running).toHaveLength(0);
    expect(t.speech.listening).toBe(false);
  });

  it("receives 5+ consecutive answers even when the engine compacts results or closes while interim text is pending", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Uno: taller de cerámica desde 2019."));
    act(() => FakeRecognition.latest.final("Dos: estamos en Lugo y somos una persona."));
    // Engine compacts results back to index 0 within the same session (WebKit / Safari behavior)
    act(() => {
      FakeRecognition.latest.onresult?.({
        resultIndex: 0,
        results: [{ isFinal: true, 0: { transcript: "Tres: hacemos vajilla para restaurantes." }, length: 1 }],
      });
    });
    // Browser closes session on silence while the 4th answer is still in interim
    act(() => FakeRecognition.latest.interim("Cuatro: unos 48.000 euros al año."));
    act(() => FakeRecognition.latest.end());
    // User speaks 5th answer in interim and clicks Next (flush) before silence timeout
    act(() => FakeRecognition.latest.interim("Cinco: tienda online y contratar a una persona."));
    act(() => t.speech.flush());
    expect(t.finals).toEqual([
      "Uno: taller de cerámica desde 2019.",
      "Dos: estamos en Lugo y somos una persona.",
      "Tres: hacemos vajilla para restaurantes.",
      "Cuatro: unos 48.000 euros al año.",
      "Cinco: tienda online y contratar a una persona.",
    ]);
  });
});
