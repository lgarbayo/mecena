// @vitest-environment jsdom
/** The jury page against the real route handlers (AI mocks): 61 → apply (two phases) → 84, signed delta, diff, undo. */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postApp } from "@/app/api/applications/route";
import { GET as getJury, POST as postJury } from "@/app/api/jury/route";
import { POST as postImprove } from "@/app/api/jury/improve/route";
import { POST as postUndo } from "@/app/api/jury/undo/route";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID } from "@/fixtures";
import { juryAi } from "@/features/jury/ai";
import { AiError } from "@/server/ai/llm";
import { JuryPage } from "@/features/jury/ui/JuryPage";
import { grantPro, loginDemo, req, seedOnboardedCreator } from "../helpers";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const routes: Record<string, { GET?: (r: Request) => Promise<Response>; POST?: (r: Request) => Promise<Response> }> = {
  "/api/jury": { GET: getJury, POST: postJury },
  "/api/jury/improve": { POST: postImprove },
  "/api/jury/undo": { POST: postUndo },
};
const posted: { url: string; body: unknown }[] = [];

beforeEach(async () => {
  await loginDemo();
  posted.length = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const path = url.split("?")[0];
    const method = (init?.method ?? "GET") as "GET" | "POST";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (method === "POST") posted.push({ url: path, body });
    const handler = routes[path]?.[method];
    if (!handler) throw new Error(`no route ${method} ${path}`);
    return handler(req(url, { method, body, headers: (init?.headers as Record<string, string>) ?? {} }));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function draft() {
  await seedOnboardedCreator();
  await grantPro();
  const res = await postApp(req("/api/applications", { body: { callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID } }));
  return (await res.json()).application;
}

describe("JuryPage", () => {
  it("61 → Aplicar mejoras (with a typed fact) → 84, diff, then Deshacer", async () => {
    const app = await draft();
    render(<JuryPage applicationId={app.id} />);
    expect(await screen.findByText("Criterios de valoración de las bases")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Aplicar mejoras")).toBeTruthy());

    const fact = screen.getByLabelText(/Dato para: Añade un calendario/);
    fireEvent.change(fact, { target: { value: "de marzo a junio de 2027" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Aplicar mejoras"));
    });
    await waitFor(() => expect(screen.getByText("+23 puntos tras las mejoras")).toBeTruthy());
    const improve = posted.find((p) => p.url === "/api/jury/improve")!.body as { stage: string; facts: unknown[] };
    expect(improve.stage).toBe("revise");
    expect(improve.facts).toEqual([{ fix: expect.stringMatching(/calendario/), text: "de marzo a junio de 2027" }]);
    expect(screen.getByText("Qué ha cambiado en tu solicitud")).toBeTruthy();
    expect(screen.getAllByText(/Modificado|Añadido/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Calendario: de marzo a junio de 2027/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Deshacer mejoras"));
    });
    await waitFor(() => expect(screen.queryByText("Deshacer mejoras")).toBeNull());
    expect(screen.queryByText(/puntos tras las mejoras/)).toBeNull();
    expect(screen.getByText("Aplicar mejoras")).toBeTruthy();
  });

  it("a failed re-score shows Spanish text and the retry does not revise again", async () => {
    const app = await draft();
    render(<JuryPage applicationId={app.id} />);
    await waitFor(() => expect(screen.getByText("Aplicar mejoras")).toBeTruthy());
    const revise = vi.spyOn(juryAi.mock, "reviseApplication");
    const judge = vi.spyOn(juryAi.mock, "judgeApplication").mockRejectedValueOnce(new AiError("Claude declined the request", "refusal"));
    await act(async () => {
      fireEvent.click(screen.getByText("Aplicar mejoras"));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Las mejoras están aplicadas, pero el tribunal no ha podido volver a puntuar/));
    expect(document.body.textContent).not.toMatch(/declined/);
    judge.mockRestore();
    await act(async () => {
      fireEvent.click(screen.getByText("Reintentar"));
    });
    await waitFor(() => expect(screen.getByText("+23 puntos tras las mejoras")).toBeTruthy());
    expect(revise).toHaveBeenCalledTimes(1);
  });

  it("estimated criteria are titled as such", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fixtureCalls } = await import("@/fixtures");
    fs.writeFileSync(path.join(process.env.MECENA_CALLS_DIR!, "calls.json"), JSON.stringify(fixtureCalls.map((c) => ({ ...c, criteriaSource: "estimated" }))));
    const app = await draft();
    render(<JuryPage applicationId={app.id} />);
    expect(await screen.findByText("Criterios estimados (las bases no publican puntuaciones)")).toBeTruthy();
    expect(screen.getByText(/criterios estimados: las bases no publican puntuaciones/)).toBeTruthy();
  });
});
