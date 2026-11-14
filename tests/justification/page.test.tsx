// @vitest-environment jsdom
/** The justification page against the real route handlers (AI mocks): photo -> assigned -> alerts -> memoria. */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postApp } from "@/app/api/applications/route";
import { GET as getState } from "@/app/api/justification/route";
import { POST as postInvoice } from "@/app/api/justification/invoices/route";
import { DELETE as delInvoice, PATCH as patchInvoice } from "@/app/api/justification/invoices/[id]/route";
import { PATCH as patchMemoria, POST as postMemoria } from "@/app/api/justification/memoria/route";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID } from "@/fixtures";
import { JustificationPage } from "@/features/justification/ui/JustificationPage";
import { gapCount, memoriaAsText } from "@/features/justification/export";
import { grantPro, loginDemo, req, seedOnboardedCreator } from "../helpers";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));
vi.mock("@/features/works/image", () => ({
  downscalePhoto: async () => ({ dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", width: 1, height: 1 }),
}));

type Handler = (r: Request, c?: { params: Promise<{ id: string }> }) => Promise<Response>;
const routes: Record<string, Partial<Record<string, Handler>>> = {
  "/api/justification": { GET: getState },
  "/api/justification/invoices": { POST: postInvoice },
  "/api/justification/memoria": { POST: postMemoria, PATCH: patchMemoria },
};

beforeEach(async () => {
  await loginDemo();
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0];
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const r = req(url, { method, body });
    const one = /^\/api\/justification\/invoices\/([^/]+)$/.exec(path);
    if (one) return (method === "DELETE" ? delInvoice : patchInvoice)(r, { params: Promise.resolve({ id: one[1] }) });
    const handler = routes[path]?.[method];
    if (!handler) throw new Error(`no route ${method} ${path}`);
    return handler(r);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function application() {
  await seedOnboardedCreator();
  await grantPro();
  const res = await postApp(req("/api/applications", { body: { callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID } }));
  return (await res.json()).application as { id: string };
}

describe("JustificationPage", () => {
  it("photo -> invoice on a line -> alerts -> memoria with gaps -> download text", async () => {
    const app = await application();
    const { container } = render(<JustificationPage applicationId={app.id} />);
    await screen.findByText("Aún no has añadido ninguna.");
    expect((screen.getByRole("button", { name: "Preparar la memoria" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Qué es esta factura (opcional)"), { target: { value: "Papelería Sol, papel de acuarela, 84,50 €" } });
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    fireEvent.change(input, { target: { files: [new File(["x"], "f.png", { type: "image/png" })] } });

    await screen.findByText("Papelería Sol");
    expect(screen.getAllByText(/84,50 €/).length).toBeGreaterThan(0);
    expect(screen.getByText("Lectura simulada")).toBeTruthy();
    expect(screen.getByText("Avisos")).toBeTruthy();
    expect((screen.getByLabelText(/Partida del presupuesto/i) as HTMLSelectElement).value).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Preparar la memoria" }));
    await screen.findByRole("textbox", { name: "Actividad realizada" });
    expect(screen.getByText(/huecos por completar/)).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Cuenta justificativa" }) as HTMLTextAreaElement).value).toContain("Papelería Sol");

    // edit and save
    fireEvent.change(screen.getByRole("textbox", { name: "Actividad realizada" }), { target: { value: "Mi texto" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar mis cambios" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Guardar mis cambios" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("textbox", { name: "Actividad realizada" }) as HTMLTextAreaElement).value).toBe("Mi texto");
  });

  it("shows a Spanish error for somebody else's application", async () => {
    render(<JustificationPage applicationId="no-existe" />);
    expect(await screen.findByText("No encontramos esta solicitud.")).toBeTruthy();
  });

  it("memoriaAsText and gapCount", () => {
    const memoria = { sections: [{ key: "a", title: "Actividad", body: "Hola [Completa: x] y [Completa: y]", sourceSegmentIds: [] }] };
    expect(gapCount(memoria)).toBe(2);
    expect(memoriaAsText({ title: "Beca", organizer: "Xunta" }, memoria)).toMatch(/MEMORIA DE JUSTIFICACIÓN — Beca[\s\S]*ACTIVIDAD/);
    expect(gapCount(null)).toBe(0);
  });
});
