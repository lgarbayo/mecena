// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { MIC_BLOCKED, isIOS, newFinalPart, speechErrorText, useSpeechRecognition } from "@/components/voice/useSpeechRecognition";
import { FakeRecognition, installFakeSpeech } from "./fakeSpeech";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPADOS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

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

function asIPhone() {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
}

describe("Android duplicate finals (lastFinalText heuristic)", () => {
  it("drops an exact repeat, ignoring case and spacing", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Hago cerámica."));
    act(() => FakeRecognition.latest.final("  hago   CERÁMICA. "));
    expect(t.finals).toEqual(["Hago cerámica."]);
  });

  it("a final that re-sends the previous one as its prefix emits only the new suffix", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Hago cerámica"));
    act(() => FakeRecognition.latest.final("Hago cerámica y vivo en Lugo"));
    expect(t.finals).toEqual(["Hago cerámica", "y vivo en Lugo"]);
  });

  it("works across an automatic restart: the new session re-sends the previous final as prefix", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Soy pintora."));
    act(() => FakeRecognition.latest.end()); // Android ends the session after the pause; the hook restarts
    expect(FakeRecognition.instances).toHaveLength(2);
    act(() => FakeRecognition.latest.final("Soy pintora. Busco una residencia."));
    act(() => FakeRecognition.latest.end());
    act(() => FakeRecognition.latest.final("soy pintora.  busco una residencia.")); // verbatim re-send after another restart
    expect(t.finals).toEqual(["Soy pintora.", "Busco una residencia."]);
  });

  it("unrelated finals pass through untouched", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Me llamo Antía."));
    act(() => FakeRecognition.latest.final("Vivo en Vigo."));
    act(() => FakeRecognition.latest.end());
    act(() => FakeRecognition.latest.final("Trabajo con barro."));
    expect(t.finals).toEqual(["Me llamo Antía.", "Vivo en Vigo.", "Trabajo con barro."]);
  });

  it("a prefix that is not on a word boundary is not cut", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Hola"));
    act(() => FakeRecognition.latest.final("Holanda me inspira"));
    expect(t.finals).toEqual(["Hola", "Holanda me inspira"]);
  });

  it("the memory resets when the person stops and starts a fresh conversation", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Sí."));
    act(() => t.speech.stop());
    act(() => FakeRecognition.latest.end());
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Sí."));
    expect(t.finals).toEqual(["Sí.", "Sí."]);
  });

  it("start() while already listening is not a fresh conversation", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Sí."));
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("sí."));
    expect(t.finals).toEqual(["Sí."]);
  });

  it("newFinalPart keeps leading inverted punctuation and strips the joining comma", () => {
    expect(newFinalPart("", "  hola  ")).toBe("hola");
    expect(newFinalPart("Hola", "Hola, ¿qué tal?")).toBe("¿qué tal?");
    expect(newFinalPart("Hola.", "Hola.")).toBe("");
  });
});

describe("Spanish error messages", () => {
  it.each([
    ["not-allowed", "No tenemos acceso al micrófono. Actívalo en los ajustes del navegador o escribe tu historia."],
    ["service-not-allowed", "No tenemos acceso al micrófono. Actívalo en los ajustes del navegador o escribe tu historia."],
    ["audio-capture", "No encontramos micrófono. Escribe tu respuesta."],
    ["network", "Sin conexión para el dictado. Escribe tu respuesta."],
    ["no-speech", "No te hemos oído bien. Acércate un poco o prueba a escribir."],
    ["language-not-supported", "Este navegador no reconoce la voz en castellano. Escribe tu respuesta."],
    ["bad-grammar", "El dictado ha fallado. Pulsa de nuevo o escribe tu respuesta."],
    ["something-new", "El dictado ha fallado. Pulsa de nuevo o escribe tu respuesta."],
  ])("speechErrorText('%s')", (code, text) => {
    expect(speechErrorText(code)).toBe(text);
  });

  it("'aborted' (our own stop) has no message", () => {
    expect(speechErrorText("aborted")).toBeNull();
    expect(speechErrorText("toString")).toBe("El dictado ha fallado. Pulsa de nuevo o escribe tu respuesta.");
  });

  it("MIC_BLOCKED lists the codes after which voice cannot work", () => {
    expect([...MIC_BLOCKED].sort()).toEqual(["audio-capture", "not-allowed", "service-not-allowed"]);
  });

  it("the hook exposes the raw code and the Spanish message, and start() clears both", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => {
      FakeRecognition.latest.error("not-allowed");
      FakeRecognition.latest.end();
    });
    expect(t.speech.errorCode).toBe("not-allowed");
    expect(t.speech.error).toBe("No tenemos acceso al micrófono. Actívalo en los ajustes del navegador o escribe tu historia.");
    expect(MIC_BLOCKED.has(t.speech.errorCode!)).toBe(true);
    act(() => t.speech.start());
    expect(t.speech.errorCode).toBeNull();
    expect(t.speech.error).toBeNull();
  });

  it("'aborted' sets the code but no message", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.error("aborted"));
    expect(t.speech.errorCode).toBe("aborted");
    expect(t.speech.error).toBeNull();
  });

  it("'no-speech' keeps listening and its message clears once speech gets through", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => {
      FakeRecognition.latest.error("no-speech");
      FakeRecognition.latest.end();
    });
    expect(t.speech.listening).toBe(true);
    expect(t.speech.errorCode).toBe("no-speech");
    expect(t.speech.error).toBe("No te hemos oído bien. Acércate un poco o prueba a escribir.");
    act(() => FakeRecognition.latest.final("Ahora sí."));
    expect(t.speech.errorCode).toBeNull();
    expect(t.speech.error).toBeNull();
    expect(t.finals).toEqual(["Ahora sí."]);
  });

  it("'language-not-supported' is fatal and explained in Spanish", () => {
    const t = setup();
    act(() => t.speech.start());
    act(() => {
      FakeRecognition.latest.error("language-not-supported");
      FakeRecognition.latest.end();
    });
    expect(t.speech.listening).toBe(false);
    expect(FakeRecognition.running).toHaveLength(0);
    expect(t.speech.error).toBe("Este navegador no reconoce la voz en castellano. Escribe tu respuesta.");
  });

  it("start() on a browser without speech recognition explains it in Spanish", () => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    const t = setup();
    expect(t.speech.supported).toBe(false);
    act(() => t.speech.start());
    expect(t.speech.error).toBe("Tu navegador no permite dictado. Escribe tu respuesta.");
    expect(t.speech.listening).toBe(false);
  });
});

describe("isIOS", () => {
  it.each([
    [IPHONE, 5, true],
    ["Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)", 5, true],
    ["Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)", 5, true],
    [IPADOS, 5, true],
    [IPADOS, 0, false], // a real Mac
    [ANDROID, 5, false],
    ["Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0.0.0", 0, false],
  ])("%s (touch points %d) -> %s", (userAgent, maxTouchPoints, expected) => {
    expect(isIOS({ userAgent, maxTouchPoints })).toBe(expected);
  });

  it("defaults to the global navigator", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    expect(isIOS()).toBe(true);
  });

  it("is false in jsdom's default navigator", () => {
    expect(isIOS()).toBe(false);
  });
});

describe("iOS Safari", () => {
  it("exposes ios and uses single-shot sessions", () => {
    asIPhone();
    const t = setup();
    expect(t.speech.ios).toBe(true);
    act(() => t.speech.start());
    expect(FakeRecognition.latest.continuous).toBe(false);
  });

  it("does not restart on its own when the session ends: it asks for a tap instead", () => {
    asIPhone();
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.final("Soy escultor."));
    act(() => FakeRecognition.latest.end());
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(FakeRecognition.running).toHaveLength(0);
    expect(t.speech.listening).toBe(false);
    expect(t.speech.tapToResume).toBe(true);
    expect(t.finals).toEqual(["Soy escultor."]);
  });

  it("the tap resumes listening in a new session and clears tapToResume", () => {
    asIPhone();
    const t = setup();
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.end());
    act(() => t.speech.start());
    expect(t.speech.tapToResume).toBe(false);
    expect(t.speech.listening).toBe(true);
    expect(FakeRecognition.running).toHaveLength(1);
    act(() => FakeRecognition.latest.final("Vivo en Sevilla."));
    expect(t.finals).toEqual(["Vivo en Sevilla."]);
  });

  it("an explicit stop() does not ask for a tap", () => {
    asIPhone();
    const t = setup();
    act(() => t.speech.start());
    act(() => t.speech.stop());
    act(() => FakeRecognition.latest.end());
    expect(t.speech.tapToResume).toBe(false);
    expect(t.speech.listening).toBe(false);
  });

  it("a fatal error does not ask for a tap", () => {
    asIPhone();
    const t = setup();
    act(() => t.speech.start());
    act(() => {
      FakeRecognition.latest.error("not-allowed");
      FakeRecognition.latest.end();
    });
    expect(t.speech.tapToResume).toBe(false);
    expect(t.speech.errorCode).toBe("not-allowed");
  });

  it("stop then a quick tap while the old session is still stopping: the next session opens when it ends", () => {
    asIPhone();
    const t = setup();
    act(() => t.speech.start());
    const first = FakeRecognition.latest;
    act(() => t.speech.stop());
    act(() => t.speech.start());
    act(() => first.end());
    expect(FakeRecognition.running).toHaveLength(1);
    expect(t.speech.listening).toBe(true);
    expect(t.speech.tapToResume).toBe(false);
  });

  it("elsewhere (Android) sessions stay continuous, restart on their own and never ask for a tap", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ANDROID);
    const t = setup();
    expect(t.speech.ios).toBe(false);
    act(() => t.speech.start());
    expect(FakeRecognition.latest.continuous).toBe(true);
    act(() => FakeRecognition.latest.end());
    expect(FakeRecognition.running).toHaveLength(1);
    expect(t.speech.listening).toBe(true);
    expect(t.speech.tapToResume).toBe(false);
  });

  it("start and stop stay referentially stable across renders", () => {
    asIPhone();
    const t = setup();
    const { start, stop } = t.speech;
    act(() => t.speech.start());
    act(() => FakeRecognition.latest.end());
    expect(t.speech.start).toBe(start);
    expect(t.speech.stop).toBe(stop);
  });
});
