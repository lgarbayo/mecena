import { describe, expect, it } from "vitest";
import type { BudgetLine, Invoice } from "@/contracts";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID } from "@/fixtures";
import { POST as postApp } from "@/app/api/applications/route";
import { GET as getState } from "@/app/api/justification/route";
import { POST as postInvoice } from "@/app/api/justification/invoices/route";
import { DELETE as delInvoice, PATCH as patchInvoice } from "@/app/api/justification/invoices/[id]/route";
import { GET as getImage } from "@/app/api/justification/invoices/[id]/image/route";
import { PATCH as patchMemoria, POST as postMemoria } from "@/app/api/justification/memoria/route";
import { amountIn } from "@/features/justification/ai";
import { economicSection, signatureOf, suggestLine, summarize } from "@/features/justification/rules";
import { removeOwnedData } from "@/features/account/service";
import { readDb, updateDb } from "@/server/store";
import { createUser, ctx, grantPro, loginDemo, req, seedOnboardedCreator } from "../helpers";

// 1x1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG2 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const budget: BudgetLine[] = [
  { concept: "Materiales: papel y pigmentos", amountEur: 1000, expenseType: "materiales" },
  { concept: "Difusión y comunicación", amountEur: 500, expenseType: "difusión" },
];
const inv = (o: Partial<Invoice>): Invoice => ({
  id: "i1",
  applicationId: "a",
  profileId: "p",
  imageUrl: "/x",
  supplier: "Papelería Sol",
  taxId: "B12345678",
  number: "F-1",
  date: "2026-05-02",
  concept: "papel",
  totalEur: 100,
  confidence: 0.9,
  extractedBy: "vision",
  createdAt: "2026-05-02T10:00:00Z",
  ...o,
});
const call = { allowedExpenses: ["materiales", "difusión"] };

describe("rules", () => {
  it("assigns by the suggested line, then expense type, then shared words", () => {
    expect(suggestLine(budget, { lineConcept: "difusion y comunicacion" })?.concept).toBe("Difusión y comunicación");
    expect(suggestLine(budget, { expenseType: "Materiales" })?.concept).toBe("Materiales: papel y pigmentos");
    expect(suggestLine(budget, { concept: "pigmentos acuarela" })?.concept).toBe("Materiales: papel y pigmentos");
    expect(suggestLine(budget, { concept: "nada que ver" })).toBeUndefined();
  });

  it("sums spending per line and leaves unassigned invoices out, with an alert", () => {
    const s = summarize(budget, [inv({ id: "a", lineConcept: budget[0].concept, totalEur: 400 }), inv({ id: "b", number: "F-2", totalEur: 50 })], call);
    expect(s.lines[0]).toMatchObject({ spentEur: 400, remainingEur: 600, invoiceCount: 1 });
    expect(s.spentEur).toBe(400);
    expect(s.unassignedEur).toBe(50);
    expect(s.alerts.map((a) => a.kind)).toContain("unassigned");
  });

  it("warns on a small overspend and flags a big one as danger", () => {
    const small = summarize(budget, [inv({ lineConcept: budget[0].concept, totalEur: 1050 })], call);
    expect(small.alerts.find((a) => a.kind === "line_over")?.severity).toBe("warn");
    const big = summarize(budget, [inv({ lineConcept: budget[0].concept, totalEur: 1300 })], call);
    expect(big.alerts.find((a) => a.kind === "line_over")?.severity).toBe("danger");
    expect(big.alerts[0].severity).toBe("danger"); // most severe first
  });

  it("flags duplicates, missing data, disallowed expenses, wrong sums and what is left to justify", () => {
    const a = inv({ id: "a", lineConcept: budget[0].concept });
    const dup = inv({ id: "b", lineConcept: budget[0].concept });
    const bad = inv({ id: "c", number: undefined, taxId: undefined, expenseType: "viajes", baseEur: 10, vatEur: 2.1, totalEur: 20, lineConcept: budget[1].concept });
    const kinds = summarize(budget, [a, dup, bad], call).alerts.map((x) => `${x.kind}:${x.invoiceId ?? ""}`);
    expect(kinds).toContain("duplicate:b");
    expect(kinds).toContain("missing_data:c");
    expect(kinds).toContain("expense_not_allowed:c");
    expect(kinds).toContain("amount_mismatch:c");
    expect(kinds).toContain("unjustified:");
    expect(kinds).not.toContain("duplicate:a");
  });

  it("the signature changes with invoices and budget", () => {
    const base = signatureOf(budget, [inv({})]);
    expect(signatureOf(budget, [inv({})])).toBe(base);
    expect(signatureOf(budget, [inv({ totalEur: 101 })])).not.toBe(base);
    expect(signatureOf([{ ...budget[0], amountEur: 1 }], [inv({})])).not.toBe(base);
  });

  it("the economic section comes from the numbers", () => {
    const invoices = [inv({ lineConcept: budget[0].concept, totalEur: 250.5 })];
    const text = economicSection(summarize(budget, invoices, call), invoices);
    expect(text).toContain("250,50 €");
    expect(text).toContain("Papelería Sol");
  });

  it("reads amounts the way people write them", () => {
    expect(amountIn("papel, 84,50 €")).toBe(84.5);
    expect(amountIn("1.200,00 euros")).toBe(1200);
    expect(amountIn("12.5 eur")).toBe(12.5);
    expect(amountIn("sin importe")).toBeUndefined();
  });
});

async function drafted() {
  await seedOnboardedCreator();
  await grantPro();
  const res = await postApp(req("/api/applications", { body: { callId: "fixture-beca-artes-plasticas", profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID } }));
  return (await res.json()).application as { id: string; budget: BudgetLine[] };
}
const addPhoto = (applicationId: string, imageDataUrl = PNG, hint?: string) => postInvoice(req("/api/justification/invoices", { body: { applicationId, imageDataUrl, hint } }));

describe("justification routes (AI mock)", () => {
  it("photo -> invoice assigned to a line -> deviation alert -> memoria, end to end", async () => {
    await loginDemo();
    const app = await drafted();
    const line = app.budget[0];

    const res = await addPhoto(app.id, PNG, `Papelería Sol, ${line.concept}, 84,50 €`);
    expect(res.status).toBe(201);
    const state = await res.json();
    expect(state.mode).toBe("mock");
    expect(state.invoices).toHaveLength(1);
    const invoice = state.invoices[0] as Invoice;
    expect(invoice).toMatchObject({ supplier: "Papelería Sol", totalEur: 84.5, extractedBy: "mock", lineConcept: line.concept, assignedBy: "ai" });
    expect(state.summary.lines.find((l: { concept: string }) => l.concept === line.concept).spentEur).toBe(84.5);
    expect(state.summary.alerts.some((a: { kind: string }) => a.kind === "missing_data")).toBe(true); // the mock never invents a NIF or a date

    // the photo is served to its owner only
    expect((await getImage(req(invoice.imageUrl), ctx({ id: invoice.id }))).status).toBe(200);
    const other = await createUser("otra@mecena.test");
    expect((await getImage(req(invoice.imageUrl, { cookie: other.cookie }), ctx({ id: invoice.id }))).status).toBe(404);
    expect((await getState(req(`/api/justification?applicationId=${app.id}`, { cookie: other.cookie }))).status).toBe(404);

    // the user fixes the data and overspends: danger alert
    const patched = await (
      await patchInvoice(req(`/api/justification/invoices/${invoice.id}`, { method: "PATCH", body: { totalEur: line.amountEur * 1.5, taxId: "B12345678", number: "F-9", date: "2026-05-02" } }), ctx({ id: invoice.id }))
    ).json();
    expect(patched.summary.alerts.find((a: { kind: string }) => a.kind === "line_over")?.severity).toBe("danger");
    expect(patched.invoices[0].lineConcept).toBe(line.concept);

    // memoria: narrative with gaps (never invented) + the numbers
    const m = await (await postMemoria(req("/api/justification/memoria", { body: { applicationId: app.id, notes: "hice la serie en mi estudio de Malpica" } }))).json();
    expect(m.memoria.generatedBy).toBe("mock");
    expect(m.memoriaStale).toBe(false);
    const keys = m.memoria.sections.map((s: { key: string }) => s.key);
    expect(keys).toEqual(["actividad", "resultados", "desviaciones", "economica"]);
    expect(m.memoria.sections[0].body).toContain("Malpica");
    expect(m.memoria.sections[1].body).toContain("[Completa:");
    expect(m.memoria.sections[3].body).toContain("Papelería Sol");

    // the user edits it, and a later change to the invoices marks it out of date
    const edited = await (await patchMemoria(req("/api/justification/memoria", { method: "PATCH", body: { applicationId: app.id, sections: m.memoria.sections.map((s: { key: string }) => (s.key === "actividad" ? { ...s, body: "Mi texto" } : s)) } }))).json();
    expect(edited.memoria.sections[0].body).toBe("Mi texto");
    const removed = await (await delInvoice(req(`/api/justification/invoices/${invoice.id}`, { method: "DELETE" }), ctx({ id: invoice.id }))).json();
    expect(removed.invoices).toHaveLength(0);
    expect(removed.memoriaStale).toBe(true);
    expect((await getImage(req(invoice.imageUrl), ctx({ id: invoice.id }))).status).toBe(404);
  });

  it("is deterministic for the same photo and differs between photos", async () => {
    await loginDemo();
    const app = await drafted();
    const a = (await (await addPhoto(app.id, PNG)).json()).invoices[0] as Invoice;
    const b = (await (await addPhoto(app.id, PNG)).json()).invoices[1] as Invoice;
    expect({ t: a.totalEur, l: a.lineConcept }).toEqual({ t: b.totalEur, l: b.lineConcept });
    expect((await (await addPhoto(app.id, PNG2)).json()).invoices).toHaveLength(3);
  });

  it("refuses other people's applications, bad images, unknown lines and an empty memoria", async () => {
    await loginDemo();
    const app = await drafted();
    const other = await createUser("otra2@mecena.test");
    expect((await postInvoice(req("/api/justification/invoices", { cookie: other.cookie, body: { applicationId: app.id, imageDataUrl: PNG } }))).status).toBe(404);
    expect((await addPhoto(app.id, "data:text/plain;base64,aGk=")).status).toBe(400);
    expect((await postMemoria(req("/api/justification/memoria", { body: { applicationId: app.id } }))).status).toBe(400);
    const inv1 = (await (await addPhoto(app.id)).json()).invoices[0] as Invoice;
    const bad = await patchInvoice(req(`/api/justification/invoices/${inv1.id}`, { method: "PATCH", body: { lineConcept: "No existe" } }), ctx({ id: inv1.id }));
    expect(bad.status).toBe(400);
    const unassign = await (await patchInvoice(req(`/api/justification/invoices/${inv1.id}`, { method: "PATCH", body: { lineConcept: null } }), ctx({ id: inv1.id }))).json();
    expect(unassign.invoices[0].lineConcept).toBeUndefined();
    expect(unassign.summary.alerts.some((a: { kind: string }) => a.kind === "unassigned")).toBe(true);
    const noAuth = await getState(req(`/api/justification?applicationId=${app.id}`, { cookie: null }));
    expect(noAuth.status).toBe(401);
  });

  it("deleting the account removes invoices and memorias", async () => {
    const { user } = await loginDemo();
    const app = await drafted();
    await addPhoto(app.id);
    await postMemoria(req("/api/justification/memoria", { body: { applicationId: app.id } }));
    expect(readDb().invoices).toHaveLength(1);
    const removed = await updateDb((db) => removeOwnedData(db, user));
    expect(removed.invoiceIds).toHaveLength(1);
    expect(readDb().invoices).toHaveLength(0);
    expect(readDb().justifications).toHaveLength(0);
  });
});
