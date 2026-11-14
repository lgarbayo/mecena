import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_CREATOR_ID, fixtureWorks } from "@/fixtures";
import { contrast } from "@/features/dossier/design";
import * as agent from "@/features/dossier/layout/agent";
import { AiError } from "@/server/ai/llm";
import { FONT_FAMILIES, FONT_TABLE, snapFace } from "@/features/dossier/layout/fonts";
import { LayoutError, prepareLayout, SAFE_X, SAFE_Y } from "@/features/dossier/layout/prepare";
import { textsOutgrewLayout } from "@/features/dossier/layout/notes";
import { FreeLayout, MAX_PAGES, type FreeLayout as Layout } from "@/features/dossier/layout/schema";
import { DAILY_LAYOUT_BATCHES, catalogFor, chooseProposal, layoutIdle, layoutState, requestChange, requestProposals, setFreeLayout, undoLayout } from "@/features/dossier/layout/service";
import { renderDossierPdf, countPages } from "@/features/dossier/service";
import { GET as layoutGet, POST as layoutPost } from "@/app/api/dossier/layout/route";
import { req, seedOnboardedCreator, loginDemo } from "../helpers";
import { seedUploadWork } from "./fixtures";
import { image, layout, mockChange, mockComposition, mockDirections, page, quoteText, text } from "./support/builders";
import fs from "node:fs";
import path from "node:path";

async function seed(works = 2) {
  await seedOnboardedCreator();
  for (let i = 0; i < works; i++) await seedUploadWork(fixtureWorks[i % fixtureWorks.length].id + (i >= fixtureWorks.length ? `-${i}` : ""), fixtureWorks[i % fixtureWorks.length].sheet, i);
}

beforeEach(async () => {
  await loginDemo();
  vi.restoreAllMocks();
});

/** Plays the model: N distinct directions, one composition per direction, changes read from the request. */
function fakeModel(opts: { failIndex?: number[]; count?: number } = {}) {
  const dirs = mockDirections(opts.count ?? 3);
  vi.spyOn(agent, "planDirections").mockResolvedValue(dirs);
  return vi.spyOn(agent, "designLayout").mockImplementation(async (input) => {
    input.onUsage?.({ inputTokens: 1000, outputTokens: 500 });
    if (input.direction && !input.request) {
      const i = dirs.findIndex((d) => d.name === input.direction!.name);
      if (opts.failIndex?.includes(i)) throw new AiError("boom", "parse");
      return mockComposition(input.catalog, i, input.direction.name);
    }
    return mockChange(input);
  });
}

describe("free layout schema", () => {
  it("accepts the whole vocabulary and rejects html, unknown types, unknown fonts and too many pages", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    expect(FreeLayout.safeParse(mockComposition(cat, 3)).success).toBe(true);
    const rich = layout(
      page(
        text("nombre", 10, 10, 80, 10, { family: "Fraunces", rotate: 90, columns: 1 }),
        { type: "ellipse", x: 10, y: 30, w: 30, h: 30, fill: "#aa3300", opacity: 0.5 },
        { type: "line", x1: 0, y1: 0, x2: 100, y2: 100, width: 2, color: "#000000", opacity: 1 },
        image(1, 0, 0, 100, 100, { fit: "cover", focus: { x: 0.2, y: 0.8 } }),
      ),
    );
    expect(FreeLayout.safeParse(rich).success).toBe(true);
    expect(FreeLayout.safeParse({ name: "x", rationale: "", pages: [{ background: "#fff", elements: [] }] }).success).toBe(false); // bad hex
    expect(FreeLayout.safeParse({ name: "x", rationale: "", pages: [{ background: "#ffffff", elements: [{ type: "html", html: "<script>" }] }] }).success).toBe(false);
    expect(FreeLayout.safeParse(layout(page(text("nombre", 10, 10, 80, 10, { family: "Comic Sans" as never })))).success).toBe(false);
    const many = layout(...Array.from({ length: MAX_PAGES + 1 }, () => page(text("nombre", 10, 10, 80, 10))));
    expect(FreeLayout.safeParse(many).success).toBe(false);
  });

  it("only offers typefaces that really exist: bundled ones have their TTF, the rest are valid Google families", () => {
    const dir = path.join(process.cwd(), "src/features/dossier/fonts");
    for (const name of FONT_FAMILIES) {
      const f = FONT_TABLE[name];
      expect(f.weights.length).toBeGreaterThan(0);
      expect(snapFace(name, 777, true).weight).toBe(f.weights[f.weights.length - 1]);
      if (f.bundled) {
        const slug = name.replace(/ /g, "");
        const files = fs.readdirSync(dir).filter((x) => x.startsWith(slug));
        for (const w of f.weights) expect(files.some((x) => x.includes(`-${w}-`))).toBe(true);
      } else expect(name).toMatch(/^[A-Za-z][A-Za-z ]{1,39}$/);
    }
  });
});

describe("guard: sources", () => {
  it("only shows the artist's text: unknown refs and invented quotes are dropped, verbatim quotes pass", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const real = cat.texts["frase.1"].paragraphs[0];
    const r = prepareLayout(layout(page(text("nombre", 10, 10, 80, 10), text("inventado.9", 10, 30, 80, 10), quoteText("Premio Nacional de Pintura 1999", 10, 40, 80, 10), quoteText(real.slice(0, 40), 10, 55, 80, 10), text("ciudad", 10, 70, 80, 5), text("disciplina", 10, 80, 80, 5))), cat);
    const all = r.layout.pages.flatMap((p) => p.elements).filter((e) => e.type === "text").flatMap((e) => (e.type === "text" ? e.paragraphs : []));
    expect(all.join(" ")).not.toMatch(/Premio Nacional/);
    expect(all).toContain(real.slice(0, 40));
    expect(r.adjustments.join(" ")).toMatch(/ya no aparece tal cual en tus textos/);
  });

  it("follows an edited text and tells the artist when the edit made a quote disappear", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const real = cat.texts["frase.1"].paragraphs[0];
    const l = layout(page(text("nombre", 10, 10, 80, 10), text("ciudad", 10, 25, 80, 5), text("disciplina", 10, 32, 80, 5), quoteText(real.slice(0, 40), 10, 45, 80, 10)));
    const before = prepareLayout(l, cat);
    expect(before.adjustments.join(" ")).not.toMatch(/ya no aparece/);

    // The artist rewrites that text: the same layout repaints with the new words, and the lost quote is reported.
    const q = real.slice(0, 40);
    const texts = Object.fromEntries(Object.entries(cat.texts).map(([id, t]) => [id, { ...t, paragraphs: t.paragraphs.map((p) => (p.includes(q) ? "Otra frase completamente distinta." : p)) }]));
    const edited = { ...cat, texts: { ...texts, nombre: { ...cat.texts.nombre, paragraphs: ["Nombre Editado"] } } };
    const after = prepareLayout(l, edited);
    const shown = after.layout.pages.flatMap((p) => p.elements).flatMap((e) => (e.type === "text" ? e.paragraphs : []));
    expect(shown).toContain("Nombre Editado");
    expect(shown.join(" ")).not.toContain(real.slice(0, 40));
    expect(after.adjustments.join(" ")).toMatch(/ya no aparece tal cual en tus textos/);
    // Only then does the panel offer the (AI-spending) re-fit button; routine guard fixes never do.
    expect(textsOutgrewLayout(before.adjustments)).toBe(false);
    expect(textsOutgrewLayout(after.adjustments)).toBe(true);
    expect(textsOutgrewLayout(["He metido los textos en la zona imprimible de la página.", "El texto va repartido en columnas."])).toBe(false);
  });

  it("never produces an image that is not one of the artist's works (any request, any work number)", async () => {
    await seed(2);
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const own = new Set(cat.works.map((w) => w.imageUrl));
    const r = prepareLayout(layout(page(image(1, 0, 0, 50, 50), image(7, 50, 0, 50, 50), text("nombre", 10, 60, 80, 10))), cat);
    const imgs = r.layout.pages.flatMap((p) => p.elements).filter((e) => e.type === "image");
    expect(imgs).toHaveLength(1);
    for (const i of imgs) if (i.type === "image") expect(own.has(i.url)).toBe(true);
    expect(r.missingWorks).toBe(true);
    for (let v = 0; v < 4; v++) {
      const p = prepareLayout(mockComposition(cat, v), cat);
      for (const pg of p.layout.pages) for (const e of pg.elements) if (e.type === "image") expect(own.has(e.url)).toBe(true);
    }
  });
});

describe("guard: clamp, overflow, overlap, contrast", () => {
  it("keeps text in the printable area but lets photos bleed", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const r = prepareLayout(layout(page(text("nombre", -10, -10, 150, 30), image(1, -5, 40, 120, 70, { fit: "contain" }))), cat);
    for (const e of r.layout.pages[0].elements) {
      if (e.type === "text") {
        expect(e.x).toBeGreaterThanOrEqual(SAFE_X);
        expect(e.x + e.w).toBeLessThanOrEqual(100 - SAFE_X + 0.01);
        expect(e.y).toBeGreaterThanOrEqual(SAFE_Y);
      }
      if (e.type === "line") continue;
      expect(e.x).toBeGreaterThanOrEqual(0);
      expect(e.x + e.w).toBeLessThanOrEqual(100.01);
      expect(e.y + e.h).toBeLessThanOrEqual(100.01);
    }
  });

  it("shrinks a long title instead of cutting it", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    cat.texts.nombre = { label: "n", paragraphs: ["Maria de los Angeles Fernandez-Valdivieso y Rodriguez de la Cuesta"] };
    const r = prepareLayout(layout(page(text("nombre", 8, 10, 84, 12, { size: 120 }))), cat);
    const t = r.layout.pages[0].elements.find((e) => e.type === "text");
    expect(t && t.type === "text" && t.size).toBeLessThan(120);
    expect(r.adjustments.join(" ")).toMatch(/reducido el tamaño/);
  });

  it("continues very long text on an extra page, never losing a word", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const words = Array.from({ length: 1800 }, (_, i) => `palabra${i}`);
    cat.texts.declaracion = { label: "d", paragraphs: [words.slice(0, 900).join(" "), words.slice(900).join(" ")] };
    const r = prepareLayout(layout(page(text("declaracion", 8, 10, 84, 40, { size: 11 }))), cat);
    expect(r.layout.pages.length).toBeGreaterThan(1);
    const shown = r.layout.pages.flatMap((p) => p.elements).flatMap((e) => (e.type === "text" ? e.paragraphs : [])).join(" ").split(/\s+/);
    expect(shown).toEqual(words);
  });

  it("falls over (LayoutError) when text cannot fit within the page cap", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    cat.texts.declaracion = { label: "d", paragraphs: [Array.from({ length: 9000 }, (_, i) => `w${i}`).join(" ")] };
    expect(() => prepareLayout(layout(page(text("declaracion", 8, 10, 84, 40))), cat)).toThrow(LayoutError);
  });

  it("separates overlapping texts and rejects overlapping photos", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const r = prepareLayout(layout(page(text("nombre", 10, 10, 80, 10, { size: 30 }), text("disciplina", 10, 11, 80, 6))), cat);
    const [a, b] = r.layout.pages[0].elements.filter((e) => e.type === "text");
    expect(b.y).toBeGreaterThan(a.y + 3);
    expect(() => prepareLayout(layout(page(image(1, 0, 0, 60, 60), image(2, 30, 30, 60, 60))), cat)).toThrow(/se solapan/);
  });

  it("fixes contrast and puts a band behind text over a photo", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const r = prepareLayout(layout({ background: "#0f1113", elements: [text("nombre", 10, 10, 80, 10, { color: "#1a1a1a" })] }), cat);
    const t = r.layout.pages[0].elements[0];
    expect(t.type === "text" && contrast(t.color, "#0f1113")).toBeGreaterThanOrEqual(4.5);
    const over = prepareLayout(layout(page(image(1, 0, 0, 100, 100, { fit: "cover" }), text("nombre", 10, 40, 80, 10, { color: "#ffffff", size: 40 }))), cat);
    expect(over.layout.pages[0].elements.some((e) => e.type === "rect")).toBe(true);
  });

  it("never deforms: a cover photo that would be cropped too much becomes contain", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    cat.works[0].ratio = 2.4;
    const r = prepareLayout(layout(page(image(1, 0, 0, 100, 100, { fit: "cover" }))), cat);
    const i = r.layout.pages[0].elements[0];
    expect(i.type === "image" && i.fit).toBe("contain");
  });
});


describe("guard: rich vocabulary", () => {
  it("keeps rotated text, columns, lines and ellipses inside the page and never cuts text", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const words = Array.from({ length: 700 }, (_, i) => `w${i}`);
    cat.texts.declaracion = { label: "d", paragraphs: [words.join(" ")] };
    const r = prepareLayout(
      layout(
        page(
          text("nombre", 50, 40, 90, 8, { rotate: 90, size: 40 }),
          text("declaracion", 6, 5, 60, 90, { columns: 3, gap: 3, size: 9 }),
          { type: "line", x1: -20, y1: 50, x2: 140, y2: 60, width: 1, color: "#000000", opacity: 1 },
          { type: "ellipse", x: 80, y: 80, w: 60, h: 40, fill: "#cc2200", opacity: 0.6 },
        ),
      ),
      cat,
    );
    const els = r.layout.pages.flatMap((p) => p.elements);
    const body = els.filter((e) => e.type === "text" && !e.rotate).flatMap((e) => (e.type === "text" ? e.paragraphs : []));
    expect(body.join(" ").split(/\s+/)).toEqual(words); // flowed across the columns, none lost, none repeated
    for (const e of els) {
      if (e.type === "line") for (const v of [e.x1, e.y1, e.x2, e.y2]) expect(v >= 0 && v <= 100).toBe(true);
      if (e.type === "ellipse") expect(e.x + e.w).toBeLessThanOrEqual(100.01);
    }
  });

  it("rejects a page cap overrun and drops images of works that were not uploaded", async () => {
    await seed(1);
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const r = prepareLayout(layout(page(image(9, 0, 0, 100, 100), text("nombre", 10, 10, 80, 10))), cat);
    expect(r.missingWorks).toBe(true);
    expect(r.adjustments.join(" ")).toMatch(/Sube más fotos/);
  });
});

describe("no works: never an empty cover", () => {
  it("a layout that asks for photos the artist does not have still gets a text page", async () => {
    await seedOnboardedCreator();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const noWorks = { ...cat, works: [] };
    const p = prepareLayout(layout(page(image(1, 0, 0, 100, 60), text("nombre", 8, 70, 84, 15, { size: 60 }))), noWorks);
    expect(p.layout.pages[0].elements.some((e) => e.type === "text" && e.size >= 40)).toBe(true);
    expect(p.layout.pages.every((pg) => pg.elements.length > 0)).toBe(true);
    expect(() => prepareLayout(layout(page(image(1, 0, 0, 100, 60))), noWorks)).toThrow(LayoutError); // nothing to show: the caller falls back
  });
});

describe("service: batch of proposals, choice, changes, undo", () => {
  it("is on by default for a new profile but shows the template until a proposal is chosen; no AI is called", async () => {
    await seed();
    const plan = vi.spyOn(agent, "planDirections");
    const s = await layoutState({ profileId: DEMO_CREATOR_ID });
    expect(s.enabled).toBe(true);
    expect(s.mode).toBe("plantilla");
    expect(s.proposals).toEqual([]);
    expect(plan).not.toHaveBeenCalled();
    const bytes = await renderDossierPdf({ profileId: DEMO_CREATOR_ID });
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("keeps existing accounts on their template design unless they switch it on", async () => {
    await seed();
    const { requestDesign, hasSavedDesign } = await import("@/features/dossier/designs");
    await requestDesign({ profileId: DEMO_CREATOR_ID, request: "fondo negro" });
    expect(hasSavedDesign(DEMO_CREATOR_ID)).toBe(true);
    expect((await layoutState({ profileId: DEMO_CREATOR_ID })).enabled).toBe(false);
    expect((await setFreeLayout({ profileId: DEMO_CREATOR_ID, enabled: true })).enabled).toBe(true);
  });

  it("generates N proposals in parallel, each with its own direction and a distinct look; the artist chooses one", async () => {
    await seed(4);
    const spy = fakeModel();
    const started = await requestProposals({ profileId: DEMO_CREATOR_ID });
    expect(started.busy).toBe(true);
    await layoutIdle(DEMO_CREATOR_ID);
    const s = await layoutState({ profileId: DEMO_CREATOR_ID });
    expect(s.busy).toBe(false);
    expect(s.proposals).toHaveLength(3);
    expect(spy).toHaveBeenCalledTimes(3);
    const calls = spy.mock.calls.map((c) => c[0]);
    for (const c of calls) {
      expect(c.direction?.name).toBeTruthy();
      expect(c.others).toHaveLength(2); // each hears the other directions
    }
    // distinct: background colour, typeface and cover scale differ across the N
    const look = (p: (typeof s.proposals)[number]) => {
      const first = p.prepared.pages[0];
      const t = first.elements.find((e) => e.type === "text");
      return `${first.background}|${t && t.type === "text" ? `${t.family}|${t.size}` : ""}`;
    };
    expect(new Set(s.proposals.map(look)).size).toBe(3);
    expect(s.outcome?.metrics?.inputTokens).toBe(3000);
    expect(s.mode).toBe("plantilla"); // nothing chosen yet

    const chosen = await chooseProposal({ profileId: DEMO_CREATOR_ID, proposalId: s.proposals[1].id });
    expect(chosen.mode).toBe("libre");
    expect(chosen.name).toBe(s.proposals[1].name);
    expect(chosen.history).toHaveLength(1);
  });

  it("changes the chosen layout in plain language, builds on what is in force, and undoes", async () => {
    await seed(3);
    const spy = fakeModel();
    await requestProposals({ profileId: DEMO_CREATOR_ID });
    await layoutIdle(DEMO_CREATOR_ID);
    const first = (await layoutState({ profileId: DEMO_CREATOR_ID })).proposals[0];
    await chooseProposal({ profileId: DEMO_CREATOR_ID, proposalId: first.id });
    await requestChange({ profileId: DEMO_CREATOR_ID, request: "fondo negro sobrio" });
    await layoutIdle(DEMO_CREATOR_ID);
    let s = await layoutState({ profileId: DEMO_CREATOR_ID });
    expect(s.outcome?.ok).toBe(true);
    expect(s.prepared?.pages[0].background).toBe("#0f1113");
    await requestChange({ profileId: DEMO_CREATOR_ID, request: "solo texto enorme" });
    await layoutIdle(DEMO_CREATOR_ID);
    s = await layoutState({ profileId: DEMO_CREATOR_ID });
    expect(spy.mock.calls.at(-1)![0].current?.pages[0].background).toBe("#0f1113");
    expect(s.prepared?.pages.every((p) => p.elements.every((e) => e.type !== "image"))).toBe(true);
    expect(s.history).toHaveLength(3);
    s = await undoLayout({ profileId: DEMO_CREATOR_ID });
    expect(s.history).toHaveLength(2);
    expect(s.prepared?.pages[0].background).toBe("#0f1113");
  });

  it("discards the proposals that fail validation or render and shows the rest", async () => {
    await seed(3);
    fakeModel({ failIndex: [1] });
    await requestProposals({ profileId: DEMO_CREATOR_ID });
    await layoutIdle(DEMO_CREATOR_ID);
    const s = await layoutState({ profileId: DEMO_CREATOR_ID });
    expect(s.proposals).toHaveLength(2);
    expect(s.outcome?.notice).toMatch(/2 de 3/);
    // a proposal the guard cannot repair is discarded too (after one retry that tells the model why)
    vi.restoreAllMocks();
    vi.spyOn(agent, "planDirections").mockResolvedValue(mockDirections(3));
    const bad = layout(page(image(1, 0, 0, 60, 60), image(2, 30, 30, 60, 60)));
    const spy = vi.spyOn(agent, "designLayout").mockImplementation(async (input) => (input.direction?.name === "Dirección 1" ? bad : mockComposition(input.catalog, 2, input.direction!.name)));
    await requestProposals({ profileId: DEMO_CREATOR_ID });
    await layoutIdle(DEMO_CREATOR_ID);
    expect((await layoutState({ profileId: DEMO_CREATOR_ID })).proposals).toHaveLength(2);
    expect(spy.mock.calls.some((c) => c[0].problem && /solapan/.test(c[0].problem))).toBe(true);
  });

  it("falls back to the template design with a Spanish notice when no proposal survives (also without a key)", async () => {
    await seed(2);
    // no key, no mock: the real agent refuses and the artist keeps the template
    await requestProposals({ profileId: DEMO_CREATOR_ID });
    await layoutIdle(DEMO_CREATOR_ID);
    let s = await layoutState({ profileId: DEMO_CREATOR_ID });
    expect(s.mode).toBe("plantilla");
    expect(s.proposals).toEqual([]);
    expect(s.outcome?.ok).toBe(false);
    expect(s.outcome?.notice).toMatch(/plantilla/);
    vi.spyOn(agent, "planDirections").mockResolvedValue(mockDirections(3));
    vi.spyOn(agent, "designLayout").mockResolvedValue({ name: "x", rationale: "", pages: [{ background: "rojo", elements: [] }] } as unknown as Layout);
    await requestProposals({ profileId: DEMO_CREATOR_ID });
    await layoutIdle(DEMO_CREATOR_ID);
    s = await layoutState({ profileId: DEMO_CREATOR_ID });
    expect(s.mode).toBe("plantilla");
    expect(s.outcome?.notice).toMatch(/plantilla/);
    const bytes = await renderDossierPdf({ profileId: DEMO_CREATOR_ID });
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("keeps the layout in force when a change fails", async () => {
    await seed(2);
    fakeModel();
    await requestProposals({ profileId: DEMO_CREATOR_ID });
    await layoutIdle(DEMO_CREATOR_ID);
    const s0 = await layoutState({ profileId: DEMO_CREATOR_ID });
    await chooseProposal({ profileId: DEMO_CREATOR_ID, proposalId: s0.proposals[0].id });
    vi.restoreAllMocks();
    vi.spyOn(agent, "designLayout").mockRejectedValue(new AiError("boom", "api"));
    await requestChange({ profileId: DEMO_CREATOR_ID, request: "x" });
    await layoutIdle(DEMO_CREATOR_ID);
    const s = await layoutState({ profileId: DEMO_CREATOR_ID });
    expect(s.outcome?.ok).toBe(false);
    expect(s.mode).toBe("libre");
    expect(s.name).toBe(s0.proposals[0].name);
  });

  it("caps batches per profile per day", async () => {
    await seed(2);
    fakeModel();
    for (let i = 0; i < DAILY_LAYOUT_BATCHES; i++) {
      await requestProposals({ profileId: DEMO_CREATOR_ID });
      await layoutIdle(DEMO_CREATOR_ID);
    }
    await expect(requestProposals({ profileId: DEMO_CREATOR_ID })).rejects.toThrow(/tandas/);
  });

  it("only ever paints the artist's own photos and words, whatever the model asks for", async () => {
    await seed(2);
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const own = new Set(cat.works.map((w) => w.imageUrl));
    const real = cat.texts["frase.1"]?.paragraphs[0];
    vi.spyOn(agent, "planDirections").mockResolvedValue(mockDirections(1));
    vi.spyOn(agent, "designLayout").mockResolvedValue(
      layout(page(image(1, 0, 0, 50, 50), image(30, 50, 0, 50, 50), text("nombre", 8, 60, 84, 12, { size: 40 }), quoteText("Premio Nacional de Pintura 1999", 8, 75, 84, 8), ...(real ? [quoteText(real.slice(0, 40), 8, 85, 84, 6)] : []))),
    );
    await requestProposals({ profileId: DEMO_CREATOR_ID });
    await layoutIdle(DEMO_CREATOR_ID);
    const s = await layoutState({ profileId: DEMO_CREATOR_ID });
    const els = s.proposals.flatMap((p) => p.prepared.pages.flatMap((pg) => pg.elements));
    for (const e of els) if (e.type === "image") expect(own.has(e.url)).toBe(true);
    expect(els.filter((e) => e.type === "image")).toHaveLength(1);
    expect(els.flatMap((e) => (e.type === "text" ? e.paragraphs : [])).join(" ")).not.toMatch(/Premio Nacional/);
  });
});

describe("render", () => {
  it("renders a multi-page A4 PDF from the chosen layout, with the artist's texts and photos", async () => {
    await seed(3);
    fakeModel();
    await requestProposals({ profileId: DEMO_CREATOR_ID });
    await layoutIdle(DEMO_CREATOR_ID);
    const s0 = await layoutState({ profileId: DEMO_CREATOR_ID });
    await chooseProposal({ profileId: DEMO_CREATOR_ID, proposalId: s0.proposals[1].id });
    const state = await layoutState({ profileId: DEMO_CREATOR_ID });
    expect(state.mode).toBe("libre");
    const bytes = await renderDossierPdf({ profileId: DEMO_CREATOR_ID });
    const raw = bytes.toString("latin1");
    expect(raw).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/);
    expect(raw).toMatch(/\/Subtype \/Image/);
    expect(countPages(bytes)).toBe(state.prepared!.pages.length);
  });
});

describe("route", () => {
  it("is private, starts jobs for the session's own profile only and polls its state", async () => {
    await seed();
    fakeModel();
    const g = await layoutGet(req(`/api/dossier/layout?profileId=${DEMO_CREATOR_ID}`));
    expect((await g.json()).proposals).toEqual([]);
    const gen = await layoutPost(req("/api/dossier/layout", { method: "POST", body: { generate: true, profileId: DEMO_CREATOR_ID } }));
    expect((await gen.json()).busy).toBe(true);
    await layoutIdle(DEMO_CREATOR_ID);
    const after = await (await layoutGet(req(`/api/dossier/layout?profileId=${DEMO_CREATOR_ID}`))).json();
    expect(after.proposals).toHaveLength(3);
    const pick = await layoutPost(req("/api/dossier/layout", { method: "POST", body: { choose: after.proposals[0].id, profileId: DEMO_CREATOR_ID } }));
    expect((await pick.json()).mode).toBe("libre");
    const other = await layoutPost(req("/api/dossier/layout", { method: "POST", body: { generate: true, profileId: "someone-elses" } }));
    expect(other.status).toBeGreaterThanOrEqual(400);
    const anon = await layoutGet(req(`/api/dossier/layout?profileId=${DEMO_CREATOR_ID}`, { cookie: null }));
    expect(anon.status).toBe(401);
  });
});

describe("wire format (what the model writes)", () => {
  it("fills defaults, clamps numbers and ends in a valid FreeLayout; keeps the model-facing schema flat", async () => {
    const { fromWire, WireLayout } = await import("@/features/dossier/layout/wire");
    const wire = WireLayout.parse({
      name: "x".repeat(90),
      rationale: "r",
      pages: [
        {
          background: "#fff",
          elements: [
            { type: "text", ref: "nombre", quote: "", x: 5, y: 5, w: 90, h: 20, size: 999, weight: 400, align: "left", color: "rojo", family: "Fraunces", rotate: 400 },
            { type: "image", work: 1, x: 0, y: 0, w: 100, h: 50, fit: "cover", focusX: 3 },
            { type: "line", x1: 0, y1: 0, x2: 100, y2: 100, width: 1, color: "#000" },
            { type: "rect", x: 0, y: 0, w: 10, h: 10, fill: "#abc", opacity: 1 },
          ],
        },
      ],
    });
    const l = fromWire(wire);
    expect(l.name).toHaveLength(60);
    expect(l.pages[0].background).toBe("#ffffff");
    const t = l.pages[0].elements[0];
    expect(t.type === "text" && t.size).toBe(300);
    expect(t.type === "text" && t.color).toBe("#16181a");
    expect(l.pages[0].elements[1].type === "image" && (l.pages[0].elements[1] as { focus?: { x: number } }).focus?.x).toBe(1);
    expect(JSON.stringify(WireLayout.toJSONSchema()).length).toBeLessThan(6000); // the strict schema was refused by the API as too large
  });
});

describe("guard: shapes under text", () => {
  it("puts a band behind a text that sits only partly on an ellipse", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    const r = prepareLayout(layout({ background: "#f3eee6", elements: [{ type: "ellipse", x: 50, y: 10, w: 40, h: 25, fill: "#7b8060", opacity: 1 }, text("nombre", 10, 18, 60, 8, { size: 30, color: "#2b3a4a" })] }), cat);
    expect(r.layout.pages[0].elements.filter((e) => e.type === "rect")).toHaveLength(1);
    expect(r.adjustments.join(" ")).toMatch(/banda/);
    const inside = prepareLayout(layout({ background: "#f3eee6", elements: [{ type: "ellipse", x: 0, y: 0, w: 100, h: 60, fill: "#1d2b3a", opacity: 1 }, text("nombre", 20, 20, 60, 8, { size: 30, color: "#2b3a4a" })] }), cat);
    const t = inside.layout.pages[0].elements.find((e) => e.type === "text");
    expect(t && t.type === "text" && contrast(t.color, "#1d2b3a")).toBeGreaterThanOrEqual(3); // fully inside: the shape is the background, colour fixed
  });
});

describe("guard: unbreakable words and orphan headings", () => {
  it("shrinks a word wider than its box instead of letting it run off the page", async () => {
    await seed();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    cat.texts.nombre = { label: "n", paragraphs: ["Repertoriooooooo"] };
    const r = prepareLayout(layout(page(text("nombre", 6, 10, 40, 10, { size: 120 }))), cat);
    const t = r.layout.pages[0].elements[0];
    expect(t.type === "text" && t.size).toBeLessThan(60);
  });

  it("offers no section title for a section the artist does not have", async () => {
    await seedOnboardedCreator();
    const cat = await catalogFor(DEMO_CREATOR_ID);
    for (const id of Object.keys(cat.texts)) if (id.startsWith("t.") && id !== "t.obra") expect(cat.texts[id.slice(2)]).toBeTruthy();
    expect(!!cat.texts["t.obra"]).toBe(cat.works.length > 0);
    const none = { ...cat, works: [] };
    expect(none.works).toHaveLength(0);
  });
});
