// @vitest-environment jsdom
/** The opening screen and /confianza work signed out (no bounce to /entrar); /confianza offers "Borrar mi cuenta" signed in. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));

import { AppProvider } from "@/components/shell/AppProvider";
import { Header } from "@/components/shell/Header";
import { TrustPage } from "@/features/onboarding/ui/TrustPage";
import { LoginScreen } from "@/features/auth/LoginScreen";

const assign = vi.fn();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ME = { user: { id: "u1", email: "ana@mecena.test" }, profile: { id: "p1", kind: "creator" }, appUserId: "app-1" };

beforeEach(() => {
  assign.mockReset();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, pathname, search: "", assign } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public pages signed out", () => {
  it.each(["/", "/confianza"])("%s stays put on a 401 from /api/auth/me and offers 'Entrar'", async (path) => {
    pathname = path;
    const fetchMock = vi.fn(async () => json(401, { error: "unauthorized", message: "Inicia sesión para continuar." }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AppProvider>
        <Header />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe("/entrar"));
    expect(assign).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.anything());
  });

  it("a private page still sends the browser to /entrar on a 401", async () => {
    pathname = "/obras";
    window.location.pathname = "/obras";
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: "unauthorized", message: "x" })));
    render(<AppProvider>{null}</AppProvider>);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/entrar?next=%2Fobras"));
  });

  it("/confianza signed out: the promise, no account section", async () => {
    pathname = "/confianza";
    const fetchMock = vi.fn(async () => json(401, { error: "unauthorized", message: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AppProvider>
        <TrustPage />
      </AppProvider>,
    );
    const text = screen.getByTestId("trust-points").textContent ?? "";
    expect(text).toMatch(/Anthropic/);
    expect(text).toMatch(/no entrena/i);
    expect(text).toMatch(/navegador/);
    expect(text).toMatch(/Google/);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("delete-account")).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("/entrar links to /confianza", () => {
    pathname = "/entrar";
    render(<LoginScreen next="/" signupCodeRequired={false} />);
    expect(screen.getByRole("link", { name: /Cómo cuidamos tu obra y tus datos/ }).getAttribute("href")).toBe("/confianza");
  });

  it("/entrar sends the profile chosen on the first screen with the new account", async () => {
    pathname = "/entrar";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(201, ME));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginScreen next="/onboarding" signupCodeRequired={false} initialMode="signup" kind="business" />);
    expect(screen.getByTestId("chosen-kind").textContent).toContain("Pyme o autónomo/a");
    expect(screen.queryByTestId("signup-kind-creator")).toBeNull(); // already chosen: not asked again
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "taller@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "contraseña-larga" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" })));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/onboarding"));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ email: "taller@example.com", kind: "business" });
  });

  it("/entrar without a chosen profile asks for it before creating the account", async () => {
    pathname = "/entrar";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(201, ME));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginScreen next="/" signupCodeRequired={false} initialMode="signup" />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "contraseña-larga" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" })));
    expect(screen.getByRole("alert").textContent).toBe("Elige si eres creador/a o pyme.");
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("signup-kind-creator"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" })));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ kind: "creator" });
  });
});

describe("Borrar mi cuenta", () => {
  it("asks for confirmation, then DELETEs /api/auth/me and leaves", async () => {
    pathname = "/confianza";
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return json(200, { ok: true });
      return json(200, ME);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AppProvider>
        <TrustPage />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Borrar mi cuenta" }));
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false);
    expect(screen.getByRole("alertdialog").textContent).toMatch(/No se puede deshacer/);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sí, borrar mi cuenta" })));
    const del = fetchMock.mock.calls.find(([, i]) => i?.method === "DELETE");
    expect(del?.[0]).toBe("/api/auth/me");
    expect(JSON.parse(String(del?.[1]?.body))).toEqual({ confirm: true });
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("'Cancelar' goes back without deleting", async () => {
    pathname = "/confianza";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(200, ME));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AppProvider>
        <TrustPage />
      </AppProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Borrar mi cuenta" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("button", { name: "Borrar mi cuenta" })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false);
  });
});
