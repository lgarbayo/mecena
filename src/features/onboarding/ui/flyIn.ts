/**
 * "Your words become your dossier": when a turn adds a profile value, its chip in the live dossier takes off from
 * where it was said (the exact words in the transcript when they are there, else the newest line) and lands in its
 * place along a short arc. Web Animations only, no dependency. No-op with reduced motion, without element.animate
 * (tests) or when there is no transcript on screen (the summary screen).
 */

const DURATION = 760;
const STAGGER = 110;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Screen box of the first occurrence of `value` inside the transcript lines, newest line first. */
function wordRect(transcript: HTMLElement, value: string): DOMRect | null {
  const needle = value.trim().toLocaleLowerCase("es");
  if (!needle) return null;
  const lines = [...transcript.querySelectorAll<HTMLElement>("[data-line-text]")].reverse();
  for (const line of lines) {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node.textContent ?? "").toLocaleLowerCase("es").indexOf(needle);
      if (at < 0) continue;
      try {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + needle.length);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0) return rect;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Fallback start: the beginning of the newest saved line. */
function lineRect(transcript: HTMLElement): DOMRect | null {
  const lines = transcript.querySelectorAll<HTMLElement>("[data-line-text]");
  const last = lines[lines.length - 1];
  if (!last) return null;
  const r = last.getBoundingClientRect();
  return r.width > 0 ? new DOMRect(r.left, r.top, Math.min(r.width, 120), Math.min(r.height, 22)) : null;
}

/** Scroll a chip's sideways row (without animation) so the chip is on screen before measuring where it lands. */
function reveal(chip: HTMLElement) {
  const row = chip.parentElement;
  if (!row || row.scrollWidth <= row.clientWidth) return;
  const left = chip.offsetLeft - row.offsetLeft;
  if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = Math.max(0, left - 8);
}

export function flyChips(chips: HTMLElement[], host: HTMLElement | null, transcript: HTMLElement | null): void {
  if (!chips.length || !host || !transcript) return;
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof chips[0].animate !== "function") return;

  chips.forEach((chip, i) => {
    reveal(chip);
    const to = chip.getBoundingClientRect();
    const from = wordRect(transcript, chip.textContent ?? "") ?? lineRect(transcript);
    if (!from || to.width === 0) return;

    const ghost = chip.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      margin: "0",
      zIndex: "60",
      pointerEvents: "none",
      animation: "none",
      transformOrigin: "left center",
      boxSizing: "border-box",
    });
    ghost.removeAttribute("data-field");
    ghost.setAttribute("aria-hidden", "true");
    host.appendChild(ghost);
    chip.style.visibility = "hidden";

    // start on top of the spoken word, at its size; rise in an arc; land on the chip
    const dx = from.left - to.left;
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = Math.min(1.4, Math.max(0.6, from.width / to.width));
    const lift = Math.min(60, 24 + Math.abs(dy) * 0.15);
    const flight = ghost.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0, offset: 0 },
        { transform: `translate(${dx}px, ${dy - 6}px) scale(${scale * 1.06})`, opacity: 1, offset: 0.14 },
        { transform: `translate(${dx * 0.42}px, ${dy * 0.42 - lift}px) scale(1.14)`, opacity: 1, offset: 0.58 },
        { transform: "translate(0, 0) scale(1)", opacity: 1, offset: 1 },
      ],
      { duration: DURATION, delay: i * STAGGER, easing: EASE, fill: "both" },
    );
    const land = () => {
      ghost.remove();
      chip.style.visibility = "";
      chip.animate([{ transform: "scale(1.16)" }, { transform: "scale(1)" }], { duration: 260, easing: EASE });
    };
    flight.finished.then(land, land);
  });
}
