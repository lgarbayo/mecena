/**
 * The end-to-end extras of the demo scenarios: the Pro scenario leaves invoices already assigned on its application
 * (one line overspent, IDEA #7) and every scenario leaves a demo organisation whose 3 members already accepted
 * (IDEA #8). Both survive reload, never touch another account and disappear with the account.
 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { POST as resetRoute } from "@/app/api/demo/reset/route";
import { GET as justificationGet } from "@/app/api/justification/route";
import { POST as invoicePost } from "@/app/api/justification/invoices/route";
import { GET as invoiceImage } from "@/app/api/justification/invoices/[id]/image/route";
import { POST as memoriaPost } from "@/app/api/justification/memoria/route";
import { GET as panelGet } from "@/app/api/panel/route";
import { deleteAccount } from "@/features/account/service";
import { checkExtras, loadJustification, loadOrg, loadPro, sampleInvoicePath } from "@/features/demo/scenarios";
import { readDb, uploadsDir } from "@/server/store";
import { ctx, createUser, req } from "../helpers";

const load = async (cookie: string, scenario: string) => (await resetRoute(req("/api/demo/reset", { cookie, body: { scenario } }))).json();
const state = async (cookie: string, applicationId: string) => (await justificationGet(req(`/api/justification?applicationId=${applicationId}`, { cookie }))).json();
const panel = async (cookie: string) => (await panelGet(req("/api/panel", { cookie }))).json();
const sampleDataUrl = () => `data:image/png;base64,${fs.readFileSync(sampleInvoicePath()).toString("base64")}`;

describe("demo files", () => {
  it("are coherent: every invoice points at a line of the Pro budget, the images exist, the amounts add up", () => {
    expect(checkExtras()).toEqual([
      { id: "justification", ok: true, problems: [] },
      { id: "panel", ok: true, problems: [] },
    ]);
    const j = loadJustification();
    for (const i of [...j.invoices, j.sample]) expect(Math.abs(i.baseEur + i.vatEur - i.totalEur)).toBeLessThan(0.02);
    const lines = new Map(loadPro().application.budget.map((l) => [l.concept, l.amountEur]));
    const spent = new Map<string, number>();
    for (const i of j.invoices) spent.set(i.lineConcept, (spent.get(i.lineConcept) ?? 0) + i.totalEur);
    // the seeded invoices overspend one line by more than 10 % (a "danger" alert) and leave the sample's line with room
    expect([...spent].filter(([c, eur]) => eur > lines.get(c)! * 1.1)).toHaveLength(1);
    expect(spent.get(j.sample.lineConcept) ?? 0).toBeLessThan(lines.get(j.sample.lineConcept)!);
    expect(loadOrg().members.length).toBe(3);
  });
});

describe("«Artista Pro con solicitud» → /justificacion", () => {
  it("leaves 3 invoices assigned with a visible deviation, their photos readable, and no memoria yet", async () => {
    const a = await createUser("ana@example.com");
    const out = await load(a.cookie, "pro");
    expect(out).toMatchObject({ pro: true, invoices: 3, panelMembers: 3 });
    const st = await state(a.cookie, out.applicationId);
    expect(st.invoices).toHaveLength(3);
    expect(st.invoices.every((i: { lineConcept?: string }) => i.lineConcept)).toBe(true);
    expect(st.summary.unassignedEur).toBe(0);
    expect(st.summary.alerts.find((x: { kind: string }) => x.kind === "line_over")).toMatchObject({ severity: "danger" });
    expect(st.memoria).toBeNull();
    for (const i of st.invoices) expect((await invoiceImage(req(i.imageUrl, { cookie: a.cookie }), ctx({ id: i.id }))).status).toBe(200);
  });

  it("the live photo: simulated AI reads the example invoice, assigns it and raises a second alert; then the memoria drafts", async () => {
    const a = await createUser("ana@example.com");
    const out = await load(a.cookie, "pro");
    const before = await state(a.cookie, out.applicationId);
    const res = await invoicePost(req("/api/justification/invoices", { cookie: a.cookie, body: { applicationId: out.applicationId, imageDataUrl: sampleDataUrl() } }));
    expect(res.status).toBe(201);
    const after = await res.json();
    expect(after.invoices).toHaveLength(4);
    const added = after.invoices.find((i: { number?: string }) => i.number === "F-0087");
    expect(added).toMatchObject({ supplier: "Imprenta Ártabra, S.L.", totalEur: 1450, lineConcept: "Edición de un catálogo con las doce piezas", assignedBy: "ai" });
    const over = (s: typeof before) => s.summary.alerts.filter((x: { kind: string }) => x.kind === "line_over").length;
    expect(over(after)).toBe(over(before) + 1);
    // a second photo without a note is not the example again
    const again = await (await invoicePost(req("/api/justification/invoices", { cookie: a.cookie, body: { applicationId: out.applicationId, imageDataUrl: sampleDataUrl() } }))).json();
    expect(again.invoices.filter((i: { number?: string }) => i.number === "F-0087")).toHaveLength(1);

    const memoria = await (await memoriaPost(req("/api/justification/memoria", { cookie: a.cookie, body: { applicationId: out.applicationId } }))).json();
    expect(memoria.memoria.sections.map((s: { key: string }) => s.key)).toEqual(expect.arrayContaining(["actividad", "desviaciones", "economica"]));
    expect(memoria.memoriaStale).toBe(false);
  });

  it("reloading the scenario resets the invoices (no leftovers, photos replaced) and leaves other accounts alone", async () => {
    const a = await createUser("ana@example.com");
    const b = await createUser("bea@example.com");
    const ob = await load(b.cookie, "pro");
    const first = await load(a.cookie, "pro");
    await invoicePost(req("/api/justification/invoices", { cookie: a.cookie, body: { applicationId: first.applicationId, imageDataUrl: sampleDataUrl() } }));
    const oldIds = readDb().invoices.filter((i) => i.applicationId === first.applicationId).map((i) => i.id);
    expect(oldIds).toHaveLength(4);
    const second = await load(a.cookie, "pro");
    expect(second.invoices).toBe(3);
    const db = readDb();
    expect(db.invoices.filter((i) => oldIds.includes(i.id))).toHaveLength(0);
    expect(fs.readdirSync(uploadsDir()).filter((f) => oldIds.some((id) => f.startsWith(id)))).toHaveLength(0);
    expect(db.invoices.filter((i) => i.applicationId === second.applicationId)).toHaveLength(3);
    expect(db.invoices.filter((i) => i.applicationId === ob.applicationId)).toHaveLength(3); // bea's are intact
    expect(db.organizations.filter((o) => o.ownerId === a.user.id)).toHaveLength(1);
    expect(db.organizations.filter((o) => o.ownerId === b.user.id)).toHaveLength(1);
  });

  it("«Empezar de cero» drops the invoices of the Pro application", async () => {
    const a = await createUser("ana@example.com");
    const pro = await load(a.cookie, "pro");
    const blank = await load(a.cookie, "blank");
    expect(blank.invoices).toBeUndefined();
    expect(readDb().invoices.some((i) => i.applicationId === pro.applicationId)).toBe(false);
  });
});

describe("every scenario → /panel", () => {
  it.each(["blank", "onboarded", "pro", "business"])("«%s» leaves the demo school with 3 members who already accepted", async (scenario) => {
    const a = await createUser("ana@example.com");
    const out = await load(a.cookie, scenario);
    expect(out.panelMembers).toBe(3);
    const p = await panel(a.cookie);
    expect(p).toMatchObject({ demo: false, hasOrg: true, org: { kind: "school" }, invitations: [] });
    expect(p.members.map((m: { displayName: string }) => m.displayName).sort()).toEqual(["Estudio Sarela", "Iago Casal", "Marta Lema"]);
    expect(p.summary).toMatchObject({ members: 3, incompleteMembers: 0 });
    expect(p.members.every((m: { matches: unknown[] }) => m.matches.length > 0)).toBe(true);
    expect(p.summary.upcomingDeadlines.length).toBeGreaterThan(0);
  });

  it("reloading does not duplicate the organisation or its members, and the members never become the account's own profiles", async () => {
    const a = await createUser("ana@example.com");
    await load(a.cookie, "pro");
    await load(a.cookie, "onboarded");
    await load(a.cookie, "pro");
    const db = readDb();
    expect(db.organizations.filter((o) => o.ownerId === a.user.id)).toHaveLength(1);
    expect(db.memberships.filter((m) => m.status === "accepted")).toHaveLength(3);
    expect(db.profiles.filter((p) => p.ownerId === a.user.id).map((p) => p.kind).sort()).toEqual(["business", "creator"]);
    expect(db.profiles.filter((p) => p.ownerId?.startsWith("demo-member:"))).toHaveLength(3);
  });

  it("two accounts each get their own school; neither sees the other's members; deleting one removes only its own", async () => {
    const a = await createUser("ana@example.com");
    const b = await createUser("bea@example.com");
    await load(a.cookie, "pro");
    await load(b.cookie, "pro");
    expect(readDb().organizations).toHaveLength(2);
    await deleteAccount(a.user);
    const db = readDb();
    expect(db.organizations.map((o) => o.ownerId)).toEqual([b.user.id]);
    expect(db.memberships).toHaveLength(3);
    expect(db.profiles.filter((p) => p.ownerId?.startsWith("demo-member:")).every((p) => p.ownerId?.startsWith(`demo-member:${b.user.id}:`))).toBe(true);
    expect((await panel(b.cookie)).summary.members).toBe(3);
  });
});
