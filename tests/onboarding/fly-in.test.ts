// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { flyChips } from "@/features/onboarding/ui/flyIn";

const rect = (left: number, top: number, width: number, height: number) => new DOMRect(left, top, width, height);

function setup() {
  document.body.innerHTML = `
    <div data-stage>
      <ol data-testid="transcript"><li><span data-line-text>Soy poeta y vivo en Vigo</span></li></ol>
      <ul><li data-chip="city|Vigo">Vigo</li></ul>
    </div>`;
  const host = document.querySelector<HTMLElement>("[data-stage]")!;
  const transcript = document.querySelector<HTMLElement>('[data-testid="transcript"]')!;
  const chip = document.querySelector<HTMLElement>("[data-chip]")!;
  chip.getBoundingClientRect = () => rect(20, 600, 60, 30);
  document.querySelector<HTMLElement>("[data-line-text]")!.getBoundingClientRect = () => rect(10, 400, 300, 20);
  return { host, transcript, chip };
}

const animations: { el: Element; frames: Keyframe[]; done: () => void }[] = [];

afterEach(() => {
  animations.length = 0;
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function stubPlatform(wordBox: DOMRect | null) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q })) as unknown as typeof window.matchMedia;
  Range.prototype.getBoundingClientRect = () => wordBox ?? rect(0, 0, 0, 0);
  HTMLElement.prototype.animate = function (this: HTMLElement, frames: Keyframe[]) {
    let done!: () => void;
    const finished = new Promise<void>((r) => (done = r));
    animations.push({ el: this, frames, done });
    return { finished } as unknown as Animation;
  } as HTMLElement["animate"];
}

describe("flyChips: profile values fly from the words that produced them", () => {
  it("starts on the exact word in the transcript, hides the chip during the flight and lands on it", async () => {
    stubPlatform(rect(220, 400, 40, 20)); // "Vigo" inside the line
    const { host, transcript, chip } = setup();
    flyChips([chip], host, transcript);

    const ghost = host.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(ghost?.textContent).toBe("Vigo");
    expect(chip.style.visibility).toBe("hidden");
    // first frame: on top of the word (dx = 220 - 20, dy = 410 - 615), at the word's size (40 / 60)
    expect(animations[0].frames[0].transform).toBe(`translate(200px, -205px) scale(${40 / 60})`);

    animations[0].done();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(chip.style.visibility).toBe("");
  });

  it("a value said in other words takes off from the newest line", () => {
    stubPlatform(null);
    const { host, transcript, chip } = setup();
    chip.textContent = "poesía"; // the person said "poeta"
    flyChips([chip], host, transcript);
    expect(animations[0].frames[0].transform).toMatch(/^translate\(-10px, -205px\)/); // line starts at x=10
  });

  it("does nothing with reduced motion or without a transcript on screen", () => {
    stubPlatform(rect(220, 400, 40, 20));
    const { host, transcript, chip } = setup();
    flyChips([chip], host, null);
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q })) as unknown as typeof window.matchMedia;
    flyChips([chip], host, transcript);
    expect(animations).toHaveLength(0);
    expect(chip.style.visibility).toBe("");
  });
});
