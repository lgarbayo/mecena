// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DeadlineAlert } from "@/features/purchases/ui/DeadlineAlert";
import { fixtureCalls } from "@/fixtures";

afterEach(cleanup);

const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const results = [{ call: { ...fixtureCalls[0], id: "soon", title: "Beca que cierra pronto", status: "open" as const, deadline: inDays(3), deadlineText: "" } }];

describe("DeadlineAlert (Pro)", () => {
  it("shows Pro the matches closing within 7 days, linking to each call", () => {
    render(<DeadlineAlert pro results={results} />);
    const alert = screen.getByTestId("deadline-alert");
    expect(alert.textContent).toContain("cierra en los próximos 7 días");
    expect(alert.textContent).toMatch(/Cierra en [23] días · Beca que cierra pronto/);
    expect(alert.querySelector("a")?.getAttribute("href")).toBe("/convocatorias/soon");
  });

  it("shows nothing on the free plan", () => {
    render(<DeadlineAlert pro={false} results={results} />);
    expect(screen.queryByTestId("deadline-alert")).toBeNull();
  });
});
