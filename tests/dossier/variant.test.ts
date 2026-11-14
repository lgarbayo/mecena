import { describe, expect, it, beforeEach } from "vitest";
import type { Call, Work } from "@/contracts";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID, FIXTURE_NOW, fixtureCalls } from "@/fixtures";
import { planVariant, scoreSeries } from "@/features/dossier/variant";
import { buildDossier, loadDossierData } from "@/features/dossier/service";
import { GET as dossierRoute } from "@/app/api/dossier/route";
import { saveWork } from "@/server/store";
import { grantPro, req, seedOnboardedCreator, loginDemo } from "../helpers";
import { writeCalls } from "./fixtures";

const work = (id: string, series: string, order: number, extra: Partial<Work["sheet"]> = {}): Work => ({
  id,
  profileId: DEMO_CREATOR_ID,
  imageUrl: `/demo/${id}.svg`,
  sheet: { title: `Obra ${id}`, year: 2024, technique: "óleo sobre lino", dimensions: "100 x 80 cm", series, ...extra },
  sheetSource: "voice",
  confirmed: true,
  order,
  createdAt: FIXTURE_NOW,
});

// Two series: the first in the user's order is about the city, the second about the sea and fishing nets.
const works: Work[] = [
  work("c1", "Ciudad dormida", 0, { concept: "Calles vacías de noche" }),
  work("c2", "Ciudad dormida", 1),
  work("c3", "Ciudad dormida", 2),
  work("m1", "Mar de redes", 3, { concept: "Rederas cosiendo redes en el puerto" }),
  work("m2", "Mar de redes", 4, { concept: "El mar y la pesca artesanal" }),
];

const baseCall = structuredClone(fixtureCalls[0]);
const seaCall: Call = {
  ...baseCall,
  id: "test-mar",
  title: "Residencia artística sobre el mar y la pesca artesanal",
  summary: "Proyectos sobre el mar, las redes y el patrimonio marítimo.",
  dossierRequirements: { maxImages: 3, maxFileMb: 5, format: "PDF" },
};
const openCall: Call = { ...baseCall, id: "test-libre", title: "Convocatoria abierta de creación", summary: "Tema libre.", dossierRequirements: undefined, criteria: [] };

// Route handlers need a session: run as the demo account (owns the fixture profiles).
beforeEach(async () => {
  await loginDemo();
});

describe("dossier variant planning", () => {
  it("puts the series closest to the call first and explains why in Spanish", () => {
    const scores = scoreSeries(works, seaCall);
    expect(scores.find((s) => s.series === "Mar de redes")!.score).toBeGreaterThan(scores.find((s) => s.series === "Ciudad dormida")!.score);
    const plan = planVariant({ works, call: seaCall });
    expect(plan.seriesOrder[0]).toBe("Mar de redes");
    expect(plan.workIds.slice(0, 2)).toEqual(["m1", "m2"]);
    expect(plan.variant.notes.join(" ")).toMatch(/Abrimos con la serie «Mar de redes»/);
  });

  it("limits works to dossierRequirements.maxImages and says so", () => {
    const plan = planVariant({ works, call: seaCall });
    expect(plan.workIds).toEqual(["m1", "m2", "c1"]);
    expect(plan.variant.maxImages).toBe(3);
    expect(plan.variant.notes[0]).toBe("La convocatoria pide máx. 3 imágenes y 5 MB: hemos dejado 3 de tus 5 obras y comprimido el PDF.");
    expect(plan.variant.notes).toContain("Formato pedido: PDF.");
  });

  it("keeps the user's order and everything when the call sets no limits or theme", () => {
    const plan = planVariant({ works, call: openCall });
    expect(plan.workIds).toEqual(works.map((w) => w.id));
    expect(plan.variant.notes.join(" ")).toMatch(/mantenemos tu orden/);
    expect(plan.variant.notes.join(" ")).toMatch(/no fijan límites/);
  });

  it("warns when the photos are heavier than the call allows", () => {
    const plan = planVariant({ works, call: seaCall, imageBytes: () => 3 * 1024 * 1024 });
    expect(plan.variant.notes.join(" ")).toMatch(/tus fotos suman 9,0 MB/);
  });

  it("uses the fixture call limits (10 images, 5 MB) with the fixture works", () => {
    const plan = planVariant({ works: works.slice(0, 2), call: fixtureCalls[0] });
    expect(plan.workIds).toHaveLength(2);
    expect(plan.variant.notes[0]).toMatch(/^La convocatoria pide máx\. 10 imágenes y 5 MB: tus 2 obras entran todas/);
  });
});

describe("buildDossier / GET /api/dossier with callId", () => {
  async function seed() {
    await seedOnboardedCreator();
    for (const w of works) await saveWork(structuredClone(w));
    writeCalls([seaCall]);
  }

  it("buildDossier derives a variant without touching the base dossier", async () => {
    await seed();
    const plain = await buildDossier({ profileId: DEMO_CREATOR_ID });
    const adapted = await buildDossier({ profileId: DEMO_CREATOR_ID, callId: seaCall.id });
    expect(plain.variant).toBeUndefined();
    expect(adapted.variant?.callId).toBe(seaCall.id);
    expect(adapted.workIds).toHaveLength(3);
    expect(adapted.workIds.slice(0, 2)).toEqual(["m1", "m2"]);
    expect(plain.workIds.length).toBeGreaterThan(3);
  });

  it("non-Pro users get the plain dossier plus the notes as a preview", async () => {
    await seed();
    const res = await dossierRoute(req(`/api/dossier?profileId=${DEMO_CREATOR_ID}&callId=${seaCall.id}&appUserId=nobody`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.adapted).toBe(false);
    expect(body.works.length).toBeGreaterThan(3);
    expect(body.dossier.variant.notes.length).toBeGreaterThan(0);
  });

  it("Pro users get the adapted dossier", async () => {
    await seed();
    await grantPro();
    const res = await dossierRoute(req(`/api/dossier?profileId=${DEMO_CREATOR_ID}&callId=${seaCall.id}&appUserId=${DEMO_APP_USER_ID}`));
    const body = await res.json();
    expect(body.adapted).toBe(true);
    expect(body.works).toHaveLength(3);
    expect(body.works.map((w: Work) => w.id).slice(0, 2)).toEqual(["m1", "m2"]);
  });

  it("loadDossierData(adapt:false) keeps the plain order", async () => {
    await seed();
    const data = await loadDossierData({ profileId: DEMO_CREATOR_ID, callId: seaCall.id, adapt: false });
    expect(data.works.length).toBeGreaterThan(3);
    expect(data.dossier.variant?.notes.length).toBeGreaterThan(0);
  });
});
