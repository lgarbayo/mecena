/**
 * A controllable stand-in for Chrome's SpeechRecognition (jsdom has none). It follows the browser's rules that matter
 * here: start() on a session that is still running throws InvalidStateError, stop() ends the session later (onend is
 * async, after any pending final), and only the test decides when results, errors and ends arrive.
 */
type Alt = { transcript: string };
type Result = { isFinal: boolean; 0: Alt; length: 1 };

export class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static reset() {
    FakeRecognition.instances = [];
  }
  /** Sessions currently capturing audio (a real page should never have more than one). */
  static get running() {
    return FakeRecognition.instances.filter((r) => r.state !== "idle");
  }
  static get latest() {
    return FakeRecognition.instances.at(-1)!;
  }

  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((e: { resultIndex: number; results: Result[] }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  state: "idle" | "listening" | "stopping" = "idle";
  starts = 0;
  private results: Result[] = [];

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    if (this.state !== "idle") throw new DOMException("Failed to execute 'start' on 'SpeechRecognition': recognition has already started.", "InvalidStateError");
    this.state = "listening";
    this.starts++;
    this.results = [];
  }
  stop() {
    if (this.state === "listening") this.state = "stopping";
  }
  abort() {
    if (this.state !== "idle") this.state = "stopping";
  }

  /** The user says something: one final result appended to this session (Chrome desktop shape). */
  final(text: string) {
    this.results.push({ isFinal: true, 0: { transcript: text }, length: 1 });
    this.onresult?.({ resultIndex: this.results.length - 1, results: [...this.results] });
  }
  interim(text: string) {
    this.onresult?.({ resultIndex: this.results.length, results: [...this.results, { isFinal: false, 0: { transcript: text }, length: 1 }] });
  }
  /** Android Chrome with continuous=true: re-sends every result so far with resultIndex 0. */
  resendAll() {
    this.onresult?.({ resultIndex: 0, results: [...this.results] });
  }
  error(code: string) {
    this.onerror?.({ error: code });
  }
  /** The browser ends the session (silence timeout, after stop(), after an error). */
  end() {
    if (this.state === "idle") return;
    this.state = "idle";
    this.onend?.();
  }
}

export function installFakeSpeech() {
  FakeRecognition.reset();
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
}
