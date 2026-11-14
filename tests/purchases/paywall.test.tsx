// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/shell/AppProvider", () => ({ useApp: () => ({ appUserId: "u-paywall" }) }));
// Route the adapter's fetch calls to the real route handlers (mock purchases mode: no keys in tests).
const { GET, POST } = await import("@/app/api/entitlements/route");
// The browser sends the session cookie with every same-origin fetch; the routes use the user's own app user id.
let cookie = "";
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  const r = new Request(`http://localhost${url}`, { ...init, headers: { ...(init?.headers as Record<string, string>), cookie } });
  return r.method === "POST" ? POST(r) : GET(r);
});
const { Paywall } = await import("@/features/purchases/ui/Paywall");
const { getEntitlement, nowIso, saveEntitlement, updateDb } = await import("@/server/store");
const { createUser } = await import("../helpers");

beforeEach(async () => {
  const u = await createUser("paywall@mecena.test");
  cookie = u.cookie;
  await updateDb((db) => {
    db.users.find((x) => x.id === u.user.id)!.appUserId = "u-paywall"; // what AppProvider hands the paywall
  });
});

afterEach(cleanup);

describe("Paywall (mock purchases)", () => {
  it("sells the outcome with the 3 plans, the anchor and the guarantee", () => {
    render(<Paywall open trigger="draft_application" onClose={() => undefined} onPurchased={() => undefined} />);
    const text = screen.getByTestId("paywall").textContent ?? "";
    expect(text).toContain("Presenta más solicitudes, mejor preparadas.");
    expect(text).toContain("Tu solicitud está a un paso");
    expect(text).toContain("Una consultora se lleva un 10-15 % de tu beca");
    expect(text).toContain("Garantía: si en 90 días no has presentado 3 solicitudes, te devolvemos el dinero.");
    for (const p of ["3,99 €/mes", "35,88 €/año", "15,00 €"]) expect(text).toContain(p);
    expect(text).toContain("Mejor precio");
  });

  it("asks to confirm the test purchase, then calls onPurchased only after the server sync", async () => {
    const onPurchased = vi.fn();
    render(<Paywall open trigger="match_limit" onClose={() => undefined} onPurchased={onPurchased} />);
    await waitFor(() => expect((screen.getByTestId("plan-proAnnual") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("plan-proAnnual"));
    const confirm = screen.getByTestId("mock-confirm");
    expect(confirm.textContent).toContain("Modo prueba: no se cobra nada.");
    expect(onPurchased).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Confirmar compra de prueba"));
    await waitFor(() => expect(onPurchased).toHaveBeenCalledTimes(1));
    expect(onPurchased.mock.calls[0][0]).toMatchObject({ appUserId: "u-paywall", pro: true });
    expect(getEntitlement("u-paywall").pro).toBe(true);
  });

  it("sells the one-off Solicitud premium only where it unlocks something (a draft)", () => {
    for (const trigger of ["draft_application", "pricing_page"] as const) {
      const { unmount } = render(<Paywall open trigger={trigger} onClose={() => undefined} onPurchased={() => undefined} />);
      expect(screen.getByTestId("plan-solicitudPremium").textContent).toContain("Válida para una solicitud completa");
      unmount();
    }
    for (const trigger of ["match_limit", "dossier_variant", "jury"] as const) {
      const { unmount } = render(<Paywall open trigger={trigger} onClose={() => undefined} onPurchased={() => undefined} />);
      expect(screen.queryByTestId("plan-solicitudPremium")).toBeNull();
      expect(screen.getByTestId("plan-proMonthly")).toBeTruthy();
      unmount();
    }
  });

  it("plans stay disabled until the purchases adapter is ready", () => {
    render(<Paywall open trigger="draft_application" onClose={() => undefined} onPurchased={() => undefined} />);
    expect((screen.getByTestId("plan-proMonthly") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("paywall").textContent).toContain("Cargando los planes…");
  });

  it("keeps the honest copy: no deadline e-mails, criteria from the bases or estimated", () => {
    render(<Paywall open trigger="pricing_page" onClose={() => undefined} onPurchased={() => undefined} />);
    const text = screen.getByTestId("paywall").textContent ?? "";
    expect(text).not.toContain("criterios oficiales");
    expect(text).toContain("con los criterios de las bases (o estimados cuando no se publican)");
    expect(text).not.toContain("avisos antes de que cierren");
    expect(text).toContain("Gratis siempre: tu perfil, tu dossier y 3 convocatorias al mes.");
  });

  it("'Restaurar compras' unlocks when the server already has the purchase, and says so when it has none", async () => {
    const onPurchased = vi.fn();
    render(<Paywall open trigger="draft_application" onClose={() => undefined} onPurchased={onPurchased} />);
    const restore = screen.getByTestId("restore-purchases") as HTMLButtonElement;
    await waitFor(() => expect(restore.disabled).toBe(false));
    fireEvent.click(restore);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("No hemos encontrado compras activas"));
    expect(onPurchased).not.toHaveBeenCalled();
    await saveEntitlement({ appUserId: "u-paywall", pro: false, premiumCredits: 1, source: "mock", updatedAt: nowIso() });
    fireEvent.click(restore);
    await waitFor(() => expect(onPurchased).toHaveBeenCalledTimes(1));
    expect(onPurchased.mock.calls[0][0]).toMatchObject({ premiumCredits: 1 });
  });

  it("'Restaurar compras' with only premium credits on a Pro screen says what the credits are for", async () => {
    await saveEntitlement({ appUserId: "u-paywall", pro: false, premiumCredits: 2, source: "mock", updatedAt: nowIso() });
    const onPurchased = vi.fn();
    render(<Paywall open trigger="match_limit" onClose={() => undefined} onPurchased={onPurchased} />);
    fireEvent.click(screen.getByTestId("restore-purchases"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Tienes 2 solicitudes premium"));
    expect(onPurchased).not.toHaveBeenCalled();
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
