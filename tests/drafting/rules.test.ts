// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Call } from "@/contracts";
import { fixtureCalls, fixtureTranscript } from "@/fixtures";
import { buildChecklist, enforce, quotedSegments, validateBudget } from "@/features/drafting/rules";
import { closedEdition, draftAsText } from "@/features/drafting/ui/export";
import { changes } from "@/features/jury/ui/client";
import { deltaText } from "@/features/jury/ui/JuryPage";

const beca = fixtureCalls.find((c) => c.id === "fixture-beca-artes-plasticas")!;

describe("draft rules", () => {
  it("validateBudget never drops or rescales: 0 lines stay, over the cap is an error", () => {
    const zero = validateBudget([{ concept: "Papel", amountEur: 0, expenseType: "Materiales" }], beca);
    expect(zero).toEqual({ budget: [{ concept: "Papel", amountEur: 0, expenseType: "materiales" }] });
    expect(validateBudget([{ concept: "A", amountEur: 9500, expenseType: "materiales" }], beca)).toEqual({ error: expect.stringMatching(/supera el máximo de 9\.000 €/) });
    expect(validateBudget([{ concept: "A", amountEur: -5, expenseType: "materiales" }], beca)).toEqual({ error: expect.stringMatching(/no es válido/) });
  });

  it("private contests only list tax / social security certificates when their bases ask for them", () => {
    const privado: Call = { ...beca, scope: "privado", requiredDocuments: ["Dossier"] };
    expect(buildChecklist(privado).map((c) => c.item)).toEqual(["Dossier"]);
    expect(buildChecklist({ ...privado, requiredDocuments: ["Dossier", "Certificado de la Seguridad Social"] }).map((c) => c.item)).toHaveLength(2);
    expect(buildChecklist(beca).some((c) => /Hacienda/.test(c.item))).toBe(true);
  });

  it("a section that quotes the transcript without listing ids gets them (Escrito con tus palabras)", () => {
    const body = "Pinto a las rederas y mariscadoras de mi familia porque su trabajo sostiene la costa.";
    expect(quotedSegments(body, fixtureTranscript)).toEqual(["seg-2"]);
    const out = enforce({ sections: [{ key: "statement", title: "Declaración", body, sourceSegmentIds: ["inventado"] }], budget: [], checklist: [] }, beca, fixtureTranscript);
    expect(out.sections[0].sourceSegmentIds).toEqual(["seg-2"]);
    expect(quotedSegments("Texto sin relación con nada de lo dicho.", fixtureTranscript)).toEqual([]);
  });

  it("closed editions are prepared for the next one", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    expect(closedEdition({ status: "recurring", deadline: "2026-03-01" }, now)).toEqual({ year: 2026, next: 2027 });
    expect(closedEdition({ status: "open", deadline: "2026-12-01" }, now)).toBeNull();
  });

  it("the text export has every section, the budget and the documents", () => {
    const txt = draftAsText(beca, {
      sections: [{ key: "memoria", title: "Memoria", body: "Mi proyecto.", sourceSegmentIds: [] }],
      budget: [{ concept: "Papel", amountEur: 500, expenseType: "materiales" }],
      checklist: [{ item: "DNI", done: true }],
    });
    expect(txt).toContain("MEMORIA\n\nMi proyecto.");
    expect(txt).toContain("- Papel (materiales): 500 €");
    expect(txt).toContain("[x] DNI");
    expect(txt).toMatch(/preséntalo tú/);
  });
});

describe("jury page helpers", () => {
  it("the delta is signed and honest", () => {
    expect(deltaText(23)).toBe("+23 puntos tras las mejoras");
    expect(deltaText(0)).toBe("Misma nota: completa los huecos marcados");
    expect(deltaText(-5)).toMatch(/^-5 puntos/);
    expect(deltaText(-5)).not.toMatch(/\+/);
  });

  it("the diff shows added, modified and removed paragraphs", () => {
    const before = { sections: [{ key: "m", title: "Memoria", body: "Uno sobre rederas de Malpica.\n\nCalendario: [Completa: fechas de inicio y fin]\n\nBorrar esto.", sourceSegmentIds: [] }] };
    const after = { sections: [{ key: "m", title: "Memoria", body: "Uno sobre rederas de Malpica.\n\nCalendario: fechas de inicio en marzo y fin en junio\n\nNuevo párrafo.", sourceSegmentIds: [] }] };
    const d = changes(before, after);
    expect(d.map((c) => c.kind).sort()).toEqual(["added", "modified", "removed"]);
    expect(d.find((c) => c.kind === "modified")?.before).toMatch(/Completa/);
  });
});
