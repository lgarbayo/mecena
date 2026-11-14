// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Work } from "@/contracts";

const create = vi.fn();
const describeWork = vi.fn();
vi.mock("@/features/works/client", async (orig) => ({
  ...(await orig<typeof import("@/features/works/client")>()),
  worksClient: { create: (...a: unknown[]) => create(...a), describe: (...a: unknown[]) => describeWork(...a), remove: vi.fn(async () => undefined) },
}));
vi.mock("@/features/works/image", async (orig) => ({
  ...(await orig<typeof import("@/features/works/image")>()),
  downscalePhoto: async () => ({ dataUrl: "data:image/jpeg;base64,AAAA", width: 10, height: 10 }),
}));

const { CaptureWork } = await import("@/features/works/CaptureWork");
const { ART_COPY } = await import("@/features/works/arts");

const stored: Work = { id: "work_1", profileId: "p1", imageUrl: "/api/works/work_1/image", sheet: { title: "Sin título" }, sheetSource: "vision", confirmed: false, order: 0, createdAt: "x" };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  create.mockReset();
  describeWork.mockReset();
});

describe("CaptureWork", () => {
  it("uploads without AI, then makes one vision call; the button tells «Subiendo foto» from «Leyendo tu obra»", async () => {
    const upload = deferred<Work>();
    const reading = deferred<Work>();
    create.mockReturnValue(upload.promise);
    describeWork.mockReturnValue(reading.promise);
    const onCreated = vi.fn();
    const { container } = render(<CaptureWork copy={ART_COPY["artes-visuales"]} onCreated={onCreated} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "obra.jpg", { type: "image/jpeg" })] } });
    });
    expect(create).toHaveBeenCalledWith("data:image/jpeg;base64,AAAA", undefined, undefined, { describe: false });

    const note = screen.getByRole("textbox");
    expect(note.getAttribute("maxLength")).toBe("4000");
    fireEvent.change(note, { target: { value: "Se llama Faro" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear ficha" }));
    expect(await screen.findByRole("button", { name: "Subiendo foto…" })).toBeTruthy();

    await act(async () => upload.resolve(stored));
    expect(await screen.findByRole("button", { name: "Leyendo tu obra…" })).toBeTruthy();
    expect(describeWork).toHaveBeenCalledTimes(1);
    expect(describeWork).toHaveBeenCalledWith("work_1", "Se llama Faro");

    await act(async () => reading.resolve({ ...stored, sheet: { title: "Faro" } }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ sheet: { title: "Faro" } })));
  });

  it("with no note it still makes the (single) vision call for sheet + crop", async () => {
    create.mockResolvedValue(stored);
    describeWork.mockResolvedValue(stored);
    const onCreated = vi.fn();
    const { container } = render(<CaptureWork copy={ART_COPY["artes-visuales"]} onCreated={onCreated} />);
    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["x"], "o.jpg", { type: "image/jpeg" })] } });
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Crear ficha" })));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(describeWork).toHaveBeenCalledWith("work_1", undefined);
  });
});
