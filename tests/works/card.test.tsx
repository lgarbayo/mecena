// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Work } from "@/contracts";
import { ART_COPY } from "@/features/works/arts";
import type { WorkPatch } from "@/features/works/client";
import { WorkCard } from "@/features/works/WorkCard";

const copy = ART_COPY["artes-visuales"];
const IDENTITY = { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 };
const SUGGESTED = { x: 0.04, y: 0.04, width: 0.92, height: 0.92, rotationDeg: 0 };

const work = (over: Partial<Work> = {}): Work => ({
  id: "work_1",
  profileId: "p1",
  imageUrl: "/api/works/work_1/image",
  sheet: { title: "Redeira II", technique: "acuarela" },
  sheetSource: "voice",
  confirmed: false,
  order: 0,
  createdAt: "2026-11-14T10:00:00.000Z",
  ...over,
});

function setup(w: Work, onSave = vi.fn<(id: string, p: WorkPatch) => Promise<void>>(async () => undefined)) {
  const utils = render(<WorkCard work={w} index={0} total={1} copy={copy} onSave={onSave} onMove={() => undefined} onRemove={() => undefined} />);
  return { ...utils, onSave };
}
const field = (label: string) => screen.getByText(label, { selector: "span" }).parentElement!.querySelector("input, textarea") as HTMLInputElement;

afterEach(cleanup);

describe("WorkCard", () => {
  it("the first tap on «Confirmar ficha» after editing a field confirms (the blur autosave no longer disables it)", async () => {
    let finishAutosave!: () => void;
    const onSave = vi.fn<(id: string, p: WorkPatch) => Promise<void>>().mockImplementationOnce(() => new Promise<void>((r) => (finishAutosave = r))).mockResolvedValue(undefined);
    setup(work(), onSave);
    const title = field("Título");
    fireEvent.focus(title);
    fireEvent.change(title, { target: { value: "Redeira III" } });
    const confirm = screen.getByRole("button", { name: "Confirmar ficha" });
    // The press keeps the field focused (no blur stealing the tap)…
    expect(fireEvent.pointerDown(confirm)).toBe(false);
    // …and even if the blur autosave runs first (keyboard, older browsers), the button stays enabled.
    fireEvent.blur(title);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][1]).toMatchObject({ confirmed: true, sheet: { title: "Redeira III" } });
    await act(async () => finishAutosave());
  });

  it("an autosave echo does not wipe what the artist is typing in another field", async () => {
    const { rerender, onSave } = setup(work());
    const title = field("Título");
    const technique = field("Técnica");
    fireEvent.focus(title);
    fireEvent.change(title, { target: { value: "Redeira III" } });
    fireEvent.blur(title); // autosave of the title goes out…
    fireEvent.focus(technique);
    fireEvent.change(technique, { target: { value: "acuarela y tinta" } }); // …while the artist types here
    // The server echoes the saved title (technique unchanged on the server).
    rerender(<WorkCard work={work({ sheet: { title: "Redeira III", technique: "acuarela" } })} index={0} total={1} copy={copy} onSave={onSave} onMove={() => undefined} onRemove={() => undefined} />);
    expect(field("Título").value).toBe("Redeira III");
    expect(field("Técnica").value).toBe("acuarela y tinta");
  });

  it("untouched fields do follow a new server sheet (e.g. a fresh vision reading)", () => {
    const { rerender, onSave } = setup(work());
    rerender(<WorkCard work={work({ sheet: { title: "Redeira II", technique: "acuarela sobre papel", year: 2025 } })} index={0} total={1} copy={copy} onSave={onSave} onMove={() => undefined} onRemove={() => undefined} />);
    expect(field("Técnica").value).toBe("acuarela sobre papel");
    expect(field("Año").value).toBe("2025");
  });

  it("«Quitar recorte» can be undone with «Restaurar recorte»", () => {
    const { onSave } = setup(work({ crop: IDENTITY, suggestedCrop: SUGGESTED }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar recorte" }));
    expect(onSave).toHaveBeenCalledWith("work_1", { crop: SUGGESTED });
    cleanup();
    setup(work({ crop: SUGGESTED, suggestedCrop: SUGGESTED }));
    expect(screen.getByRole("button", { name: "Quitar recorte" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restaurar recorte" })).toBeNull();
  });

  it("says when the photo could not be analysed", () => {
    setup(work({ analysis: "failed", crop: IDENTITY, suggestedCrop: IDENTITY }));
    expect(screen.getByText(/No hemos podido analizar la foto/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restaurar recorte" })).toBeNull();
  });
});
