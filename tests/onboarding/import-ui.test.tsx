// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportDossier } from "@/features/onboarding/ui/ImportDossier";

afterEach(() => vi.unstubAllGlobals());

describe("ImportDossier", () => {
  it("sends pasted text and reports the filled sections", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ profile: {}, sections: [], changedSectionKeys: ["statement", "bio"], changedProfileFields: ["displayName"], segmentIds: ["a", "b"], worksFound: ["Redeira I"], mode: "ai" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onImported = vi.fn();
    render(<ImportDossier kind="creator" profileId="p1" onImported={onImported} defaultOpen />);
    fireEvent.change(screen.getByLabelText(/Texto de tu dossier/), { target: { value: "Soy Antía, pinto rederas." } });
    fireEvent.click(screen.getByText("Usar este texto"));
    await waitFor(() => expect(onImported).toHaveBeenCalled());
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ text: "Soy Antía, pinto rederas.", profileId: "p1" });
    expect(screen.getByTestId("import-done").textContent).toMatch(/2 secciones/);
    expect(screen.getByTestId("import-done").textContent).toMatch(/Aparece 1 obra/);
  });

  it("shows the server message when the file cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unsupported", message: "Pega el texto de tu dossier" }), { status: 422 })));
    render(<ImportDossier kind="creator" onImported={() => undefined} defaultOpen />);
    fireEvent.change(screen.getByLabelText(/Texto de tu dossier/), { target: { value: "x" } });
    fireEvent.click(screen.getByText("Usar este texto"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Pega el texto/);
  });
});
