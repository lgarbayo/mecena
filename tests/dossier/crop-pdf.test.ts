import fs from "node:fs";
import path from "node:path";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import type { Call } from "@/contracts";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID, fixtureCalls, fixtureCreator, fixtureWorks } from "@/fixtures";
import { GET as pdfRoute } from "@/app/api/dossier/pdf/route";
import { GET as imagesRoute } from "@/app/api/dossier/images/route";
import { mockDesign } from "@/features/dossier/ai";
import { formatChecks } from "@/features/dossier/adapt-ai";
import { presetDesign } from "@/features/dossier/design";
import { wantsHighResolution, wantsLooseImages } from "@/features/dossier/images";
import { cropBox, framePdfImage } from "@/features/dossier/pdf/crop";
import { DossierPdf, juryText } from "@/features/dossier/pdf/DossierPdf";
import { dossierView, exportDossierPdf, loadDossierData, pdfReport, pdfSizeNote, renderDossierPdf } from "@/features/dossier/service";
import { getWork, saveDossier, saveWork, uploadsDir } from "@/server/store";
import { grantPro, loginDemo, req, seedOnboardedCreator } from "../helpers";
import { makePng, seedUploadWork, writeCalls } from "./fixtures";

function collectText(node: ReactNode, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") return (out.push(String(node)), out);
  if (Array.isArray(node)) return (node.forEach((n) => collectText(n, out)), out);
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === "function") return collectText((el.type as (p: unknown) => ReactNode)(el.props), out);
    return collectText(el.props.children, out);
  }
  return out;
}
const images = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;

async function seedUploads() {
  await seedOnboardedCreator();
  await seedUploadWork(fixtureWorks[0].id, fixtureWorks[0].sheet, 0);
  await seedUploadWork(fixtureWorks[1].id, fixtureWorks[1].sheet, 1);
}

beforeEach(async () => {
  await loginDemo();
});

describe("crop and straighten reach the PDF (in-memory copy, original untouched)", () => {
  it("cropBox: the box keeps the crop size and follows its centre through the rotation", () => {
    expect(cropBox({ x: 0.25, y: 0.25, width: 0.5, height: 0.5, rotationDeg: 0 }, { width: 120, height: 160 })).toEqual({ left: 30, top: 40, width: 60, height: 80 });
    // A centred crop stays centred in the (bigger) rotated canvas.
    const b = cropBox({ x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotationDeg: 5 }, { width: 100, height: 100 }, { width: 109, height: 109 });
    expect(b).toEqual({ left: 15, top: 15, width: 80, height: 80 });
  });

  it("framePdfImage crops, rotates and downscales; without crop or cap it returns the original bytes", async () => {
    const png = { data: makePng(120, 160), format: "png" as const };
    const cut = await framePdfImage(png, { x: 0.25, y: 0.25, width: 0.5, height: 0.5, rotationDeg: 0 });
    expect(cut.format).toBe("jpg");
    expect(await sharp(cut.data).metadata()).toMatchObject({ width: 60, height: 80 });
    const turned = await framePdfImage(png, { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotationDeg: 4 });
    expect(await sharp(turned.data).metadata()).toMatchObject({ width: 96, height: 128 });
    const small = await framePdfImage(png, undefined, { maxEdge: 40 });
    expect((await sharp(small.data).metadata()).height).toBe(40);
    expect(await framePdfImage(png, { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 })).toBe(png);
  });

  it("the PDF embeds the cropped photo and the upload on disk stays byte-for-byte the original", async () => {
    await seedUploads();
    const id = fixtureWorks[0].id;
    const file = path.join(uploadsDir(), `${id}.png`);
    const before = fs.readFileSync(file);
    await saveWork({ ...getWork(id), crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotationDeg: 2 } });
    const pdf = await renderDossierPdf({ profileId: DEMO_CREATOR_ID });
    expect(pdf.toString("latin1")).toMatch(/\/Filter \/DCTDecode/); // the cropped copy goes in as JPEG
    expect(fs.readFileSync(file).equals(before)).toBe(true);
  });

  it("the dossier view carries the crop for the web frame", async () => {
    await seedUploads();
    await saveWork({ ...getWork(fixtureWorks[0].id), crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotationDeg: 0 } });
    const view = dossierView(await loadDossierData({ profileId: DEMO_CREATOR_ID }));
    const works = view.kind === "creator" ? view.series.flatMap((s) => s.works) : [];
    expect(works.find((w) => w.id === fixtureWorks[0].id)?.crop).toMatchObject({ x: 0.1, width: 0.8 });
  });
});

describe("unreviewed sheets", () => {
  it("are left out of the PDF until confirmed", async () => {
    await seedUploads();
    const all = images(await renderDossierPdf({ profileId: DEMO_CREATOR_ID }));
    await saveWork({ ...getWork(fixtureWorks[1].id), confirmed: false });
    const fewer = images(await renderDossierPdf({ profileId: DEMO_CREATOR_ID }));
    expect(fewer).toBeLessThan(all);
  });

  it("never enter a call version, and are counted for the «sin revisar» notice", async () => {
    await seedUploads();
    await saveWork({ ...getWork(fixtureWorks[1].id), confirmed: false });
    const data = await loadDossierData({ profileId: DEMO_CREATOR_ID, callId: fixtureCalls[0].id, adapt: false });
    expect(data.dossier.variant).toBeDefined();
    const variant = await loadDossierData({ profileId: DEMO_CREATOR_ID, callId: fixtureCalls[0].id });
    expect(variant.works.map((w) => w.id)).toEqual([fixtureWorks[0].id]);
    const { GET } = await import("@/app/api/dossier/route");
    const body = await (await GET(req(`/api/dossier?profileId=${DEMO_CREATOR_ID}`))).json();
    expect(body.unreviewed).toBe(1);
  });
});

describe("the PDF for the jury carries no working notes", () => {
  it("no «Para la convocatoria i de n», no criteria chips, no «Pendiente» gaps", async () => {
    await seedUploads();
    const profile = structuredClone(fixtureCreator);
    await saveDossier({
      profileId: profile.id,
      kind: "creator",
      workIds: [],
      generatedAt: "2026-11-13T10:00:00.000Z",
      sections: [{ key: "statement", title: "Declaración", body: "Pinto a las rederas de mi familia.", sourceSegmentIds: [], status: "draft", updatedAt: "2026-11-13T10:00:00.000Z" }],
    });
    const data = await loadDossierData({ profileId: DEMO_CREATOR_ID, callId: fixtureCalls[0].id });
    const view = dossierView(data);
    expect(view.variant?.sections.some((s) => s.paras.flat().some((p) => p.pending))).toBe(true); // the screen still has them
    const text = collectText(createElement(DossierPdf, { view, images: {} })).join(" ");
    expect(text).not.toMatch(/Para la convocatoria/);
    expect(text).not.toMatch(/Pendiente|PENDIENTE/);
    expect(text).not.toMatch(/\d+ ptos?\b/);
  });

  it("juryText drops gaps and tidies the spaces they leave", () => {
    expect(juryText([{ text: "Mi proyecto dura ", pending: false }, { text: "calendario", pending: true }, { text: " meses.", pending: false }])).toBe("Mi proyecto dura meses.");
  });
});

describe("file size against the call's limit (no claim of compression)", () => {
  const limited = (maxFileMb: number): Call => ({ ...structuredClone(fixtureCalls[0]), id: `limit-${maxFileMb}`, dossierRequirements: { maxImages: 10, maxFileMb } });

  it("measures the real PDF and reduces the photos only when it is over the limit", async () => {
    await seedUploads();
    writeCalls([limited(0.001), limited(50)]);
    const big = await exportDossierPdf({ profileId: DEMO_CREATOR_ID, callId: "limit-50" });
    expect(big.note).toMatch(/^El PDF pesa \d+,\d MB: dentro del límite de 50 MB/);
    const tiny = await renderDossierPdf({ profileId: DEMO_CREATOR_ID, callId: "limit-0.001" });
    const report = pdfReport(tiny);
    expect(report.reduced).toBe(true);
    expect(pdfSizeNote(report)).toMatch(/incluso con las fotos reducidas/);
    // The plain dossier has no limit and says nothing.
    expect(pdfSizeNote(pdfReport(await renderDossierPdf({ profileId: DEMO_CREATOR_ID })))).toBeUndefined();
  });

  it("GET /api/dossier/pdf?info=1 returns the size report (Pro call version)", async () => {
    await seedUploads();
    writeCalls([limited(50)]);
    await grantPro();
    const r = await pdfRoute(req(`/api/dossier/pdf?profileId=${DEMO_CREATOR_ID}&callId=limit-50&appUserId=${DEMO_APP_USER_ID}&info=1`));
    const body = await r.json();
    expect(body).toMatchObject({ maxFileMb: 50, reduced: false });
    expect(body.note).toMatch(/dentro del límite/);
  });
});

describe("calls that want loose images, not a PDF", () => {
  const laracha: Pick<Call, "dossierRequirements" | "requiredDocuments"> = { dossierRequirements: { maxImages: 3, format: "JPG, TIFF o PNG (mín. 3000×2000 px)" }, requiredDocuments: [] };
  it("detects them from the bases", () => {
    expect(wantsLooseImages(laracha)).toBe(true);
    expect(wantsHighResolution(laracha)).toBe(true);
    expect(wantsLooseImages({ dossierRequirements: { format: "Cartel 70×50 cm + archivos originales (PDF, EPS, SVG, AI, PSD, PNG o TIFF)" }, requiredDocuments: [] })).toBe(true);
    expect(wantsLooseImages({ dossierRequirements: { format: "PDF" }, requiredDocuments: [] })).toBe(false);
    expect(wantsLooseImages({ dossierRequirements: { format: "Dossier en PDF con imágenes JPG" }, requiredDocuments: [] })).toBe(false);
    expect(wantsLooseImages(fixtureCalls[0])).toBe(false);
  });

  it("GET /api/dossier/images zips the untouched originals of the confirmed works", async () => {
    await seedUploads();
    await saveWork({ ...getWork(fixtureWorks[1].id), confirmed: false });
    const r = await imagesRoute(req(`/api/dossier/images?profileId=${DEMO_CREATOR_ID}`));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/zip");
    const zip = Buffer.from(await r.arrayBuffer());
    expect(zip.subarray(0, 4).readUInt32LE(0)).toBe(0x04034b50);
    const text = zip.toString("utf8");
    expect(text).toContain(`01 Antía Varela – ${fixtureWorks[0].sheet.title}.png`);
    expect(text).not.toContain(fixtureWorks[1].sheet.title);
    expect(zip.includes(fs.readFileSync(path.join(uploadsDir(), `${fixtureWorks[0].id}.png`)))).toBe(true);
  });
});

describe("small copy fixes", () => {
  it("«Biografía breve» and the series text count as part of the dossier", () => {
    const call = { ...structuredClone(fixtureCalls[0]), dossierRequirements: undefined, requiredDocuments: ["Biografía breve", "Texto de presentación de la serie", "Bio (máx. 500 caracteres)", "DNI"] };
    const checks = formatChecks(call, 2);
    expect(checks.filter((c) => c.status === "ok").map((c) => c.rule)).toEqual(["Biografía breve", "Texto de presentación de la serie", "Bio (máx. 500 caracteres)"]);
    expect(checks.find((c) => c.rule === "DNI")?.status).toBe("no_aplica");
  });

  it("the first design says «a partir del mar», never «de el»", () => {
    const d = mockDesign({ request: "", interview: ["Vivo junto al mar y pinto el puerto"], current: presetDesign("sobrio", "creator"), profile: fixtureCreator, workColors: [], history: [] });
    expect(d.rationale).toContain("a partir del mar");
    expect(d.rationale).not.toMatch(/\bde el\b/);
  });
});
