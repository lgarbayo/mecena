// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/shell/AppProvider", () => ({ useApp: () => ({ appUserId: "u-paywall" }) }));
// Route the adapter's fetch calls to the real route handlers (mock purchases mode: no keys in tests).
const { GET, POST } = await import("@/app/api/entitlements/route");
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const r = new Request(`http://localhost${url}`, init);
  return r.method === "POST" ? POST(r) : GET(r);
});
const { Paywall } = await import("@/features/purchases/ui/Paywall");
const { getEntitlement } = await import("@/server/store");

afterEach(cleanup);

describe("Paywall (mock purchases)", () => {
  it("sells the outcome with the 3 plans, the anchor and the guarantee", () => {
    render(<Paywall open trigger="draft_application" onClose={() => undefined} onPurchased={() => undefined} />);
    const text = screen.getByTestId("paywall").textContent ?? "";
    expect(text).toContain("Presenta más solicitudes, mejor preparadas.");
    expect(text).toContain("Tu solicitud está a un paso");
    expect(text).toContain("Una consultora se lleva un 10-15 % de tu beca");
    expect(text).toContain("Garantía: si en 90 días no has presentado 3 solicitudes, te devolvemos el dinero.");
    for (const p of ["9,00 €/mes", "79,00 €/año", "15,00 €"]) expect(text).toContain(p);
    expect(text).toContain("Mejor precio");
  });

  it("asks to confirm the test purchase, then calls onPurchased only after the server sync", async () => {
    const onPurchased = vi.fn();
    render(<Paywall open trigger="match_limit" onClose={() => undefined} onPurchased={onPurchased} />);
    fireEvent.click(screen.getByTestId("plan-proAnnual"));
    const confirm = screen.getByTestId("mock-confirm");
    expect(confirm.textContent).toContain("Modo prueba: no se cobra nada.");
    expect(onPurchased).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirmar compra de prueba"));
    await waitFor(() => expect(onPurchased).toHaveBeenCalledTimes(1));
    expect(onPurchased.mock.calls[0][0]).toMatchObject({ appUserId: "u-paywall", pro: true });
    expect(getEntitlement("u-paywall").pro).toBe(true);
  });

  it("closes with the × button and renders nothing when closed", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Paywall open trigger="jury" onClose={onClose} onPurchased={() => undefined} />);
    fireEvent.click(screen.getByLabelText("Ahora no"));
    expect(onClose).toHaveBeenCalled();
    rerender(<Paywall open={false} trigger="jury" onClose={onClose} onPurchased={() => undefined} />);
    expect(screen.queryByTestId("paywall")).toBeNull();
  });
});
