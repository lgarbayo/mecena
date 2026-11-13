import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { DEMO_CREATOR_ID, fixtureBusiness, fixtureCreator, FIXTURE_NOW } from "@/fixtures";
import type { Dossier, Profile } from "@/contracts";
import { isBlank, toDossierView } from "@/features/dossier/model";
import { loadDossierData } from "@/features/dossier/service";
import { DossierDocument } from "@/features/dossier/ui/DossierDocument";
import { seedOnboardedCreator } from "../helpers";

const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe("DossierDocument (editorial page)", () => {
  it("renders the creator dossier with cover, statement, works and contact", async () => {
    await seedOnboardedCreator();
    const data = await loadDossierData({ profileId: DEMO_CREATOR_ID });
    const out = html(createElement(DossierDocument, { view: toDossierView(data) }));
    expect(out).toContain("Antía Varela");
    expect(out).toContain('data-section="cover"');
    expect(out).toContain('data-section="statement"');
    expect(out).toContain("Cat. 1");
    expect(out).toContain("<cite>Redeira I</cite>");
    expect(out).toContain("56 × 76 cm");
    expect(out).not.toContain('data-state="pending"');
    // The fixture creator gave no contact details yet: the section is hidden, not a blank sheet.
    expect(out).not.toContain('class="sheet contact"');
    const withMail = toDossierView({ ...data, profile: { ...data.profile, links: ["antia@example.com"] } });
    expect(html(createElement(DossierDocument, { view: withMail }))).toContain('class="sheet contact"');
  });

  it("hides empty sections on a finished dossier and shows skeletons when building", () => {
    const blank: Profile = { ...structuredClone(fixtureCreator), displayName: "", statement: "", bio: "", achievements: [], education: [], disciplines: [], city: undefined, links: [] };
    const dossier: Dossier = { profileId: blank.id, kind: "creator", sections: [], workIds: [], generatedAt: FIXTURE_NOW };
    const view = toDossierView({ profile: blank, dossier, works: [] });
    expect(isBlank(view)).toBe(true);
    expect(html(createElement(DossierDocument, { view }))).not.toContain("<section");
    const building = html(createElement(DossierDocument, { view, progressive: true }));
    expect(building).toContain('data-state="pending"');
    expect(building).toContain("Cuéntame de dónde viene tu trabajo");
    expect(building).toContain('data-hint="Haz una foto de la obra"');
  });

  it("renders the business dossier with actividad, cifras and CNAE", () => {
    const dossier: Dossier = { profileId: fixtureBusiness.id, kind: "business", sections: [], workIds: [], generatedAt: FIXTURE_NOW };
    const view = toDossierView({ profile: structuredClone(fixtureBusiness), dossier, works: [] });
    const out = html(createElement(DossierDocument, { view }));
    expect(out).toContain('data-kind="business"');
    expect(out).toContain("Dossier de empresa");
    if (fixtureBusiness.cnae) expect(out).toContain(fixtureBusiness.cnae);
    expect(out).toContain('data-section="figures"');
  });

  it("shows the call band on the cover only for the adapted variant", () => {
    const dossier: Dossier = {
      profileId: fixtureCreator.id,
      kind: "creator",
      sections: [],
      workIds: [],
      generatedAt: FIXTURE_NOW,
      variant: { callId: "x", notes: ["La convocatoria pide máx. 3 imágenes."] },
    };
    const view = toDossierView({ profile: structuredClone(fixtureCreator), dossier, works: [] });
    expect(html(createElement(DossierDocument, { view }))).toContain("Dossier para:");
    expect(html(createElement(DossierDocument, { view: { ...view, variant: undefined } }))).not.toContain("Dossier para:");
  });
});
