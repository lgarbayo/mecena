// @vitest-environment jsdom
/** Pyme mode: no dossier to build. The onboarding fills the company card and shows the aid it already fits. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { Profile } from "@/contracts";
import { DEMO_BUSINESS_ID, DEMO_CREATOR_ID, fixtureBusiness } from "@/fixtures";
import { saveProfile } from "@/server/store";

// The signed-in user's active profile, as the real routes would resolve it from the session.
let activeProfileId = DEMO_CREATOR_ID;

// Route the client's fetch helpers to the real services (mock AI): onboarding state/turns and the calls feed.
vi.mock("@/lib/api-client", async () => {
  const onboarding = await import("@/features/onboarding/service");
  const matching = await import("@/features/matching/service");
  return {
    apiGet: async (url: string) => {
      const u = new URL(url, "http://x");
      const profileId = u.searchParams.get("profileId") ?? activeProfileId;
      if (u.pathname === "/api/calls") return matching.callsFeed({ profileId, appUserId: "u" });
      return onboarding.getOnboardingState(profileId);
    },
    apiSend: async (_url: string, body: { text: string; source: "voice" | "text"; profileId?: string }) => onboarding.processTurn({ ...body, profileId: body.profileId ?? activeProfileId }),
  };
});
const speech = { supported: true, listening: false, interim: "", error: null as string | null, start: vi.fn(), stop: vi.fn() };
let onFinal: ((t: string) => void) | undefined;
vi.mock("@/components/voice/useSpeechRecognition", () => ({
  useSpeechRecognition: (o: { onFinal: (t: string) => void }) => {
    onFinal = o.onFinal;
    return speech;
  },
}));
const app = { profile: null as Profile | null, appUserId: "u", refresh: async () => undefined, setMode: async () => undefined };
vi.mock("@/components/shell/AppProvider", () => ({ useApp: () => app, useOptionalApp: () => app }));
vi.mock("next/navigation", () => ({ usePathname: () => "/onboarding", useRouter: () => ({ push: vi.fn() }) }));

const { OnboardingClient } = await import("@/features/onboarding/ui/OnboardingClient");
const { BottomNav } = await import("@/components/shell/BottomNav");
const { HomeActions } = await import("@/features/onboarding/ui/HomeActions");

afterEach(cleanup);

/** A pyme that has only said its name: the card is empty, so nothing can be matched yet. */
const blankBusiness: Profile = {
  ...fixtureBusiness,
  displayName: "",
  city: undefined,
  province: undefined,
  region: undefined,
  sector: undefined,
  cnae: undefined,
  employees: undefined,
  foundedYear: undefined,
  annualRevenueEur: undefined,
  legalForm: undefined,
  bio: "",
  statement: "",
  achievements: [],
  fundingNeeds: [],
  projectIdea: undefined,
  links: [],
};

describe("/onboarding in pyme mode", () => {
  beforeEach(async () => {
    activeProfileId = DEMO_BUSINESS_ID;
    app.profile = null;
  });

  it("shows the company card and the aid it already fits, never a dossier", async () => {
    render(<OnboardingClient />);
    const panel = await screen.findByTestId("matches-panel");
    await waitFor(() => expect(within(panel).getByTestId("matches-count").textContent).toBe("1"));
    expect(panel.textContent).toContain("[FIXTURE] Ayudas a la digitalización de pequeños negocios");
    expect(document.body.textContent).toContain("Ficha de tu empresa");
    expect(document.body.textContent).not.toMatch(/dossier|Memoria de tu empresa/i);
    expect(document.querySelector("[data-section]")).toBeNull();
  });

  it("the matches refresh while the owner talks, and the finish CTA goes to the aid", async () => {
    await saveProfile(structuredClone(blankBusiness));
    render(<OnboardingClient />);
    const panel = await screen.findByTestId("matches-panel");
    const score = () => Number(within(panel).getByLabelText(/de 100$/).textContent);
    await waitFor(() => expect(within(panel).getByTestId("matches-count").textContent).toBe("1"));
    const before = score();

    act(() => {
      onFinal!("Mi taller se llama Cerámica Mareira, hacemos cerámica artesanal en Lugo desde 2019 y somos dos personas.");
      onFinal!("Soy autónoma y queremos montar una tienda online.");
    });
    // Place, legal form and size now pass the call's checks instead of "Confírmalo": the fit goes up live.
    await waitFor(() => expect(score()).toBeGreaterThan(before), { timeout: 5000 });
    const cta = await screen.findByTestId("finish-cta");
    expect(cta.getAttribute("href")).toBe("/convocatorias");
    expect(cta.textContent).toBe("Ver la ayuda que encaja");
  });

  it("a pyme is never offered artist-only calls", async () => {
    const { searchCalls } = await import("@/features/matching/service");
    const results = await searchCalls({ profileId: fixtureBusiness.id });
    expect(results.map((r) => r.call.id)).toEqual(["fixture-digitalizacion-pymes"]);
  });
});

describe("pyme navigation", () => {
  it("the bottom nav drops works and dossier for a pyme", () => {
    app.profile = { ...fixtureBusiness };
    render(<BottomNav />);
    const labels = screen.getAllByRole("link").map((a) => a.textContent);
    expect(labels).toEqual(["Tu empresa", "Ayudas", "Pro"]);
  });

  it("the creator nav is unchanged", () => {
    app.profile = null;
    render(<BottomNav />);
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/onboarding", "/obras", "/dossier", "/convocatorias", "/pro"]);
  });

  it("the home offers a pyme its company card and its aid, not a dossier upload", () => {
    app.profile = { ...fixtureBusiness };
    render(<HomeActions />);
    expect(screen.getByTestId("home-cta").getAttribute("href")).toBe("/onboarding");
    expect(screen.getByTestId("home-calls").getAttribute("href")).toBe("/convocatorias");
    expect(screen.queryByTestId("home-import")).toBeNull();
  });
});

describe("pyme feed keeps artist-tagged calls that admit companies", () => {
  it("a short-film call open to production companies stays in a pyme's feed", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fixtureCalls } = await import("@/fixtures");
    const art = fixtureCalls.find((c) => c.id === "fixture-premio-ilustracion")!; // no residence or age limits
    const open = { ...art, id: "fixture-open-to-companies", beneficiaryKinds: ["creator" as const], beneficiaryTypes: ["persona-fisica" as const, "autonomo" as const, "pyme" as const], eligibility: { ...art.eligibility, legalForms: [] } };
    const dir = process.env.MECENA_CALLS_DIR!;
    fs.writeFileSync(path.join(dir, "calls.json"), JSON.stringify([...fixtureCalls, open]));
    const { searchCalls } = await import("@/features/matching/service");
    const ids = (await searchCalls({ profileId: fixtureBusiness.id })).map((r) => r.call.id);
    expect(ids).toContain("fixture-open-to-companies");
    expect(ids).not.toContain(art.id);
  });
});
