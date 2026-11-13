import fs from "node:fs";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEMO_BUSINESS_ID, fixtureWorks } from "@/fixtures";
import { DossierPdf } from "@/features/dossier/pdf/DossierPdf";
import { countPages, dossierView, exportDossierPdf, loadDossierData, pdfRenderer, renderDossierPdf, renderFallbackPdf } from "@/features/dossier/service";
import { loadPdfImage } from "@/features/dossier/pdf/images";
import { GET as pdfRoute } from "@/app/api/dossier/pdf/route";
import { req, seedOnboardedCreator } from "../helpers";
import { seedUploadWork } from "./fixtures";

/** Expands function components and collects every string in the @react-pdf render tree. */
function collectText(node: ReactNode, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, out));
    return out;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === "function") return collectText((el.type as (p: unknown) => ReactNode)(el.props), out);
    return collectText(el.props.children, out);
  }
  return out;
}

async function seedCreatorWithUploads() {
  await seedOnboardedCreator();
  // Replace the SVG fixture art with real PNG uploads, as after beat 3.
  await seedUploadWork(fixtureWorks[0].id, fixtureWorks[0].sheet, 0);
  await seedUploadWork(fixtureWorks[1].id, fixtureWorks[1].sheet, 1);
}

describe("dossier PDF", () => {
  it("renders an A4 PDF with embedded uploads, real fonts and Spanish accents", async () => {
    await seedCreatorWithUploads();
    const bytes = await renderDossierPdf({});
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(5 * 1024);
    const raw = bytes.toString("latin1");
    expect(raw).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/); // A4
    expect(raw).toMatch(/\/Subtype \/Image/); // uploads embedded from disk
    expect(raw).toMatch(/SchibstedGrotesk|Newsreader/); // embedded TTF, renders á é í ó ú ñ
    const pages = countPages(bytes);
    expect(pages).toBeGreaterThanOrEqual(4);
    expect(pages).toBeLessThanOrEqual(8);
  });

  it("the render tree carries the artist's name and the statement with accents intact", async () => {
    await seedCreatorWithUploads();
    const data = await loadDossierData({});
    const text = collectText(createElement(DossierPdf, { view: dossierView(data), images: {} })).join(" ");
    expect(text).toContain("Antía Varela");
    expect(text).toContain("Declaración");
    expect(text).toContain("Biografía");
    expect(text).toContain("Redeiras");
    expect(text).toContain("Cat. 1");
    expect(text).toContain("56 × 76 cm");
    expect(text).toContain("Exposiciones colectivas");
    expect(text).toContain("Formación");
  });

  it("reads upload images from disk and skips formats the PDF cannot embed", async () => {
    await seedCreatorWithUploads();
    expect(loadPdfImage("/api/works/work-1/image")?.format).toBe("png");
    expect(loadPdfImage("/demo/works/redeira-1.svg")).toBeUndefined();
    expect(loadPdfImage("/api/works/nope/image")).toBeUndefined();
  });

  it("still renders when works only have SVG demo art (empty frames, no crash)", async () => {
    await seedOnboardedCreator();
    const bytes = await renderDossierPdf({});
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(countPages(bytes)).toBeGreaterThan(1);
  });

  it("renders the business template", async () => {
    const data = await loadDossierData({ profileId: DEMO_BUSINESS_ID });
    const text = collectText(createElement(DossierPdf, { view: dossierView(data), images: {} })).join(" ");
    for (const s of ["Cerámica Mareira", "Actividad", "Cifras", "CNAE", "2341", "48.000", "Ubicación", "Lugo", "Contacto", "@ceramicamareira"]) expect(text).toContain(s);
    const bytes = await renderDossierPdf({ profileId: DEMO_BUSINESS_ID });
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("falls back to the minimal PDF when the renderer throws", async () => {
    await seedOnboardedCreator();
    const spy = vi.spyOn(pdfRenderer, "render").mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const bytes = await renderDossierPdf({});
    expect(bytes.toString("latin1")).toContain("Dossier - Ant");
    expect(bytes.toString("latin1").startsWith("%PDF")).toBe(true);
    spy.mockRestore();
  });

  it("fallback PDF is valid on its own", () => {
    const b = renderFallbackPdf("Antía Varela");
    expect(b.toString("latin1")).toMatch(/^%PDF-1\.4[\s\S]*%%EOF\n$/);
    expect(countPages(b)).toBe(1);
  });

  it("GET /api/dossier/pdf streams application/pdf and never 500s", async () => {
    await seedCreatorWithUploads();
    const res = await pdfRoute(req("/api/dossier/pdf?profileId=demo-creator"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("dossier-antia-varela.pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");

    vi.spyOn(pdfRenderer, "render").mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res2 = await pdfRoute(req("/api/dossier/pdf"));
    expect(res2.status).toBe(200);
  });

  it("exportDossierPdf writes the file and returns a public URL and page count", async () => {
    await seedCreatorWithUploads();
    const out = await exportDossierPdf({});
    expect(fs.existsSync(out.filePath)).toBe(true);
    expect(out.url).toBe("http://localhost:3000/api/dossier/pdf?profileId=demo-creator");
    expect(out.pages).toBeGreaterThanOrEqual(4);
    expect(out.pages).toBeLessThanOrEqual(8);
  });
});
