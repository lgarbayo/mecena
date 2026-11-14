// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Call, Dossier, Profile, Work } from "@/contracts";
import { blankBusiness, DEMO_CREATOR_ID, FIXTURE_NOW, fixtureCalls, fixtureCreator, fixtureWorks } from "@/fixtures";

let params = new URLSearchParams();
let app: { profile: Profile | null; appUserId: string } = { profile: null, appUserId: "u" };
let payload: { dossier: Dossier; profile: Profile; works: Work[]; call?: Call; adapted: boolean; unreviewed?: number };
const pushed: string[] = [];
let path = "/dossier";
vi.mock("next/navigation", () => ({
  useSearchParams: () => params,
  usePathname: () => path,
  useRouter: () => ({ push: (p: string) => pushed.push(p) }),
}));
vi.mock("@/components/shell/AppProvider", () => ({
  useApp: () => ({ ...app, setMode: async () => undefined, refresh: async () => undefined }),
}));
vi.mock("@/lib/api-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-client")>()),
  apiGet: async (url: string) => (url.startsWith("/api/dossier/design") ? Promise.reject(new Error("no design in tests")) : payload),
  apiSend: async () => Promise.reject(new Error("no design agent in tests")),
}));
vi.mock("@/features/purchases/ui/Paywall", () => ({ Paywall: () => null }));

const { DossierScreen } = await import("@/features/dossier/ui/DossierScreen");
const { DesignPanel } = await import("@/features/dossier/ui/DesignPanel");
const { DossierDocument } = await import("@/features/dossier/ui/DossierDocument");
const { toDossierView } = await import("@/features/dossier/model");

const dossier = (profileId: string, kind: Profile["kind"]): Dossier => ({ profileId, kind, sections: [], workIds: [], generatedAt: FIXTURE_NOW });

afterEach(() => {
  cleanup();
  params = new URLSearchParams();
  pushed.length = 0;
});

describe("/dossier for a pyme speaks of the company", () => {
  it("empty state: «Cuéntanos tu empresa», no «fotografía tus obras»", async () => {
    const profile = { ...blankBusiness, displayName: "" };
    app = { profile, appUserId: "u" };
    payload = { dossier: dossier(profile.id, "business"), profile, works: [], adapted: false };
    render(<DossierScreen />);
    expect(await screen.findByText(/Cuéntanos tu empresa/)).toBeTruthy();
    expect(screen.queryByText(/fotografía tus obras/)).toBeNull();
    expect(screen.getByText("Memoria de empresa")).toBeTruthy();
  });

  it("the design panel offers company examples", () => {
    render(<DesignPanel kind="business" suggested="sobrio" suggestedReason="" forCall={false} workColors={[]} profileId="p" onChange={() => undefined} onUndo={async () => undefined} />);
    expect(screen.getByText("Diseña tu memoria")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Con el azul de nuestra marca" })).toBeTruthy();
    expect(screen.queryByText(/fanzine|la obra a sangre/i)).toBeNull();
  });

});

describe("/dossier notices", () => {
  it("«N obras sin revisar» with a link to /obras; the unreviewed work is marked on the page", async () => {
    const works = [fixtureWorks[0], { ...fixtureWorks[1], confirmed: false }];
    app = { profile: fixtureCreator, appUserId: "u" };
    payload = { dossier: { ...dossier(DEMO_CREATOR_ID, "creator"), workIds: works.map((w) => w.id) }, profile: fixtureCreator, works, adapted: false, unreviewed: 1 };
    render(<DossierScreen />);
    const notice = await screen.findByTestId("unreviewed");
    expect(notice.textContent).toMatch(/^1 obra sin revisar: no entra en el PDF/);
    expect(notice.querySelector("a")?.getAttribute("href")).toBe("/obras");
    expect(screen.getAllByTestId("work-unreviewed")).toHaveLength(1);
  });

  it("a call that wants loose images says so and offers the photos", async () => {
    const call = { ...structuredClone(fixtureCalls[0]), id: "laracha", dossierRequirements: { maxImages: 3, format: "JPG, TIFF o PNG (mín. 3000×2000 px)" } };
    params = new URLSearchParams({ callId: "laracha" });
    app = { profile: fixtureCreator, appUserId: "u" };
    payload = { dossier: dossier(DEMO_CREATOR_ID, "creator"), profile: fixtureCreator, works: [fixtureWorks[0]], call, adapted: false };
    render(<DossierScreen />);
    const box = await screen.findByTestId("loose-images");
    expect(box.textContent).toMatch(/pide las imágenes sueltas/);
    expect(box.textContent).toMatch(/alta resolución/);
    expect(screen.getByTestId("loose-zip").getAttribute("href")).toBe(`/api/dossier/images?profileId=${DEMO_CREATOR_ID}&callId=laracha`);
  });
});

describe("the web dossier shows the crop", () => {
  it("a cropped work renders the crop box over the original; an uncropped one the plain photo", () => {
    const works = [{ ...fixtureWorks[0], crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotationDeg: 1 } }, fixtureWorks[1]];
    const view = toDossierView({ profile: fixtureCreator, dossier: { ...dossier(DEMO_CREATOR_ID, "creator"), workIds: works.map((w) => w.id) }, works });
    const html = renderToStaticMarkup(<DossierDocument view={view} />);
    expect(html).toContain('class="frame__crop"');
    expect(html.match(/class="frame__crop"/g)?.length).toBe(2); // cover + its catalogue entry
    expect(html).toContain(`src="${fixtureWorks[1].imageUrl}"`);
  });
});
