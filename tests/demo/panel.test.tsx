// @vitest-environment jsdom
/** /demo panel: one button per scenario with confirmation, the two plan-B switches explained, mode-aware links. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ROUTES } from "@/contracts";

const refresh = vi.fn(async () => undefined);
let kind: "creator" | "business" = "creator";
vi.mock("@/components/shell/AppProvider", () => ({ useApp: () => ({ refresh, profile: { kind } }) }));

import { DemoReset, SCENARIOS, screens } from "@/features/demo/ui/DemoReset";

const status = (over: Record<string, unknown> = {}) => ({
  email: "ana@example.com",
  appUserId: "mecena-1",
  activeProfileKind: kind,
  settings: { deterministicJury: false, aiMock: false },
  aiMode: "anthropic",
  effectiveAiMode: "anthropic",
  purchasesMode: "revenuecat",
  revenueCatVerified: true,
  demoAccount: true,
  canLoadPro: true,
  pro: false,
  proIsDemoGrant: false,
  openCalls: { creator: 12, business: 2 },
  scenarios: ["blank", "onboarded", "pro", "business"].map((scenario) => ({ scenario, ok: true, problems: [] })),
  extras: [{ id: "justification", ok: true, problems: [] }, { id: "panel", ok: true, problems: [] }],
  ...over,
});

function mockFetch(st = status()) {
  const calls: { url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });
      if (url.includes("/api/demo/reset")) return new Response(JSON.stringify({ ok: true, scenario: body.scenario, appUserId: "x", activeProfileId: "p", pro: body.scenario === "pro", applicationId: body.scenario === "pro" ? "app-1" : undefined, callId: body.scenario === "pro" ? "c-1" : undefined }));
      if (body) return new Response(JSON.stringify({ ...st, settings: { ...st.settings, ...body } }));
      return new Response(JSON.stringify(st));
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  kind = "creator";
});

describe("/demo panel", () => {
  it("shows the four scenarios and both switches with an explanation", async () => {
    mockFetch();
    render(<DemoReset email="ana@example.com" />);
    for (const s of ["Empezar de cero", "Artista de ejemplo", "Artista Pro con solicitud", "Pyme de ejemplo"]) expect(await screen.findByRole("button", { name: s })).toBeTruthy();
    expect(screen.getByText("Tribunal determinista (plan B)")).toBeTruthy();
    expect(screen.getByText("IA simulada para esta cuenta")).toBeTruthy();
    expect(screen.getByText(/61 en el primer borrador y 84/)).toBeTruthy();
  });

  it("asks for confirmation; cancelling does nothing, confirming loads the scenario and links to the tribunal", async () => {
    const calls = mockFetch();
    render(<DemoReset email="ana@example.com" />);
    const btn = await screen.findByRole("button", { name: "Artista Pro con solicitud" });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(btn);
    expect(calls.some((c) => c.url.includes("/api/demo/reset"))).toBe(false);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    fireEvent.click(btn);
    const link = await screen.findByRole("link", { name: "Abre el tribunal (61)" });
    expect(link.getAttribute("href")).toBe(ROUTES.jury("app-1"));
    expect(calls.find((c) => c.url.includes("/api/demo/reset"))?.body).toMatchObject({ scenario: "pro" });
    expect(refresh).toHaveBeenCalled();
  });

  it("flips the deterministic jury switch for this account", async () => {
    const calls = mockFetch();
    render(<DemoReset email="ana@example.com" />);
    const sw = await screen.findByRole("switch", { name: "Tribunal determinista (plan B)" });
    await waitFor(() => expect((sw as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(sw);
    await waitFor(() => expect(calls.some((c) => c.url.includes("/api/demo/settings") && (c.body as { deterministicJury?: boolean })?.deterministicJury === true)).toBe(true));
  });

  it("locks the Pro scenario for accounts outside DEMO_EMAILS and says why", async () => {
    mockFetch(status({ canLoadPro: false, demoAccount: false }));
    render(<DemoReset email="ana@example.com" />);
    await screen.findByText(/DEMO_EMAILS/);
    expect((screen.getByRole("button", { name: "Artista Pro con solicitud" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("links follow the mode: a pyme never gets «Obras» or the artist's «Dossier»", () => {
    const biz = screens("business");
    expect(biz.map((l) => l.label)).not.toContain("Obras");
    expect(biz.map((l) => l.label)).not.toContain("Dossier");
    expect(biz.find((l) => l.href === ROUTES.dossier)?.label).toBe("Memoria de la empresa");
    expect(screens("creator").map((l) => l.href)).toContain(ROUTES.works);
  });

  it("copy is Spanish from Spain (no voseo)", () => {
    const text = SCENARIOS.map((s) => `${s.title} ${s.what} ${s.when} ${s.confirm}`).join(" ");
    expect(text).not.toMatch(/\b(querés|tenés|podés|sabés|hacé|contá|vos)\b/i);
  });
});
