// @vitest-environment jsdom
/** WP-04 UI: the "Pregúntale a Mecena" sheet and /cuenta "Conectar con Claude". fetch is stubbed (no server). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AgentSheet, launcherVisible, Linkified, SUGGESTIONS } from "@/features/agent/ui/AgentSheet";
import { claudeCodeCommand, claudeDesktopConfig, ConnectClaude } from "@/features/agent/ui/ConnectClaude";

vi.mock("next/navigation", () => ({ usePathname: () => "/convocatorias", useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("launcher placement", () => {
  it("never shows on full-screen stages, the paywall or pages with sticky action bars", () => {
    for (const p of ["/", "/onboarding", "/entrar", "/pro", "/solicitud/x", "/tribunal/y", "/convocatorias/abc"]) expect(launcherVisible(p), p).toBe(false);
    for (const p of ["/convocatorias", "/dossier", "/obras", "/cuenta", "/demo"]) expect(launcherVisible(p), p).toBe(true);
  });
});

describe("AgentSheet", () => {
  it("sends a suggestion to /api/agent and shows the reply, its links and the tools used", async () => {
    const fetchMock = vi.fn(async () =>
      jsonRes({
        reply: "Dossier listo. Ábrelo aquí: http://localhost:3000/dossier?profileId=p1 y paga en https://pay.example.com/x.",
        toolCalls: [
          { name: "build_dossier", input: {}, ok: true },
          { name: "draft_application", input: {}, ok: false },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentSheet open onClose={() => undefined} />);
    expect(screen.getByRole("dialog", { name: "Pregúntale a Mecena" })).toBeTruthy();
    fireEvent.click(screen.getByText(SUGGESTIONS[0]));
    await screen.findByText(/Dossier listo/);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/agent");
    expect(JSON.parse(String(init.body))).toEqual({ message: SUGGESTIONS[0], history: [] });
    const local = screen.getByText("localhost:3000/dossier?profileId=p1") as HTMLAnchorElement;
    expect(local.getAttribute("href")).toBe("/dossier?profileId=p1"); // same site: stays in the tab, with the session
    expect(local.getAttribute("target")).toBeNull();
    expect((screen.getByText("pay.example.com/x") as HTMLAnchorElement).getAttribute("target")).toBe("_blank");
    expect(screen.getByText(/✓ Preparar el dossier/)).toBeTruthy();
    expect(screen.getByText(/! Redactar la solicitud/)).toBeTruthy();
  });

  it("sends the conversation as history on the next message and shows a Spanish error on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonRes({ reply: "Hola, soy Mecena.", toolCalls: [] })).mockResolvedValueOnce(jsonRes({ error: "internal", message: "boom" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentSheet open onClose={() => undefined} />);
    const input = screen.getByLabelText("Tu mensaje");
    fireEvent.change(input, { target: { value: "hola" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Hola, soy Mecena.");
    fireEvent.change(input, { target: { value: "¿y ahora?" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText(/No he podido responder ahora mismo/);
    const second = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(second.history).toEqual([
      { role: "user", content: "hola" },
      { role: "assistant", content: "Hola, soy Mecena." },
    ]);
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("closes with Escape", () => {
    const onClose = vi.fn();
    render(<AgentSheet open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("linkifies without swallowing trailing punctuation", () => {
    render(<p>{Linkified({ text: "Mira https://mecena.fly.dev/pro." })}</p>);
    expect(screen.getByText("mecena.fly.dev/pro").getAttribute("href")).toBe("https://mecena.fly.dev/pro");
  });
});

describe("Conectar con Claude", () => {
  const endpoint = "https://mecena.fly.dev/api/mcp";
  const token = "mcn_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

  it("setup snippets: Claude Code header and Claude Desktop through mcp-remote", () => {
    expect(claudeCodeCommand(endpoint, token)).toBe(`claude mcp add --transport http mecena ${endpoint} --header "Authorization: Bearer ${token}"`);
    const cfg = JSON.parse(claudeDesktopConfig(endpoint, token));
    expect(cfg.mcpServers.mecena.args).toEqual(["-y", "mcp-remote", endpoint, "--header", "Authorization:${MECENA_AUTH}"]);
    expect(cfg.mcpServers.mecena.env).toEqual({ MECENA_AUTH: `Bearer ${token}` });
  });

  it("creates a token, shows it once with both setups, and lists it", async () => {
    const info = { id: "mcptok-1", label: "Claude Desktop", prefix: "mcn_abcdef…", createdAt: "2026-11-14T10:00:00.000Z" };
    let tokens: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        tokens = [info];
        return jsonRes({ token, info, endpoint }, 201);
      }
      return jsonRes({ tokens, endpoint });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectClaude />);
    await screen.findByText("Todavía no has conectado Claude.");
    expect(screen.getByText(endpoint)).toBeTruthy();
    fireEvent.click(screen.getByText("Crear token"));
    await screen.findByText(token);
    expect(screen.getByText(/Solo lo verás esta vez/)).toBeTruthy();
    expect(screen.getByText(claudeCodeCommand(endpoint, token))).toBeTruthy();
    expect(screen.getByText(/"mcp-remote"/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText("mcn_abcdef…")).toBeTruthy());
  });
});
