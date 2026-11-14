// Owned by WP-09. Demo reset and scenarios, per account: POST /api/demo/reset wipes only the signed-in user's own data
// and, optionally, loads a ready-made scenario (data/demo/*.json) into that same account. The admin CLI
// (scripts/demo-reset.ts) still resets the whole database.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ForbiddenError, publicEnv, serverEnv, type Application, type Call, type Db, type Dossier, type Invoice, type OrgMembership, type Profile, type User, type Work } from "@/contracts";
import { blankProfileFor, newAppUserId } from "@/server/auth";
import { exportsDir, initialDb, listCalls, nowIso, readDb, resetDb, updateDb, uploadsDir, withCanonicalFields } from "@/server/store";
import { forgetDesigns } from "@/features/dossier/designs";
import { forgetProfileSearches } from "@/features/calls-ingest/live";
import { forgetDeepResearch } from "@/features/deep-research/service";
import { buildChecklist } from "@/features/drafting/rules";
import { scoreApplication } from "@/features/jury/service";
import { demoMemberOwner, removePanelData } from "@/features/panel/service";
import { runWithAiSwitches } from "./ai-mode";
import { invoiceImagePath, loadArtist, loadBusiness, loadJustification, loadOrg, loadPro, pickProCall, workImagePath, type DemoScenarioId, type JustificationFile, type OrgFile, type PersonaFile } from "./scenarios";
import { isDemoEmail, setDemoSettings } from "./settings";

export interface DemoResetResult {
  ok: true;
  scenario: DemoScenarioId;
  appUserId: string;
  activeProfileId: string;
  pro: boolean;
  applicationId?: string;
  callId?: string;
  /** pro: invoices already assigned on that application (see /justificacion/<applicationId>). */
  invoices?: number;
  /** Members of the demo organisation who already accepted (see /panel). */
  panelMembers?: number;
}

/** Marks the Pro granted by the demo scenario (B's entitlement code leaves it alone, see docs/demo-script.md). */
export { DEMO_PRODUCT_ID } from "@/features/purchases/server";
import { DEMO_PRODUCT_ID } from "@/features/purchases/server";

/**
 * Whether this account may load the Pro scenario: its email is in DEMO_EMAILS, or purchases are entirely mocked
 * (no RevenueCat keys: anyone can "buy" with the mock adapter anyway). Never a way around real verification.
 */
export function canGrantDemoPro(user: Pick<User, "email">): boolean {
  if (isDemoEmail(user.email)) return true;
  return publicEnv().purchasesMock && !serverEnv().revenueCatSecretKey;
}

const short = () => randomUUID().slice(0, 8);

function personaProfile(userId: string, persona: PersonaFile): Profile {
  return withCanonicalFields({ ...structuredClone(persona.profile), id: `profile-${randomUUID()}`, ownerId: userId, beneficiaryTypes: [], updatedAt: nowIso() });
}

interface Materialised {
  profile: Profile;
  segmentIds: Map<string, string>; // file id -> stored id
  works: Work[];
  copies: { from: string; to: string }[];
}

/** Puts one persona (profile, transcript, dossier, works) into the db for this account. Segment and work ids are fresh. */
function materialise(db: Db, userId: string, persona: PersonaFile): Materialised {
  const profile = personaProfile(userId, persona);
  const now = nowIso();
  const suffix = short();
  const segmentIds = new Map(persona.transcript.map((s) => [s.id, `${s.id}-${suffix}`]));
  const remap = (ids: string[]) => ids.map((id) => segmentIds.get(id)).filter((x): x is string => Boolean(x));
  db.profiles.push(profile);
  db.transcripts.push({ profileId: profile.id, segments: persona.transcript.map((s) => ({ ...s, id: segmentIds.get(s.id)!, at: now })) });
  const copies: Materialised["copies"] = [];
  const works: Work[] = persona.works.map((w, i) => {
    const id = `work-${randomUUID().slice(0, 8)}`;
    const ext = path.extname(w.image).slice(1).replace("jpeg", "jpg");
    copies.push({ from: workImagePath(w.image), to: path.join(uploadsDir(), `${id}.${ext}`) });
    return { id, profileId: profile.id, imageUrl: `/api/works/${id}/image`, sheet: structuredClone(w.sheet), sheetSource: "seed", confirmed: true, order: i, createdAt: now, mediaKind: "image", links: [] };
  });
  db.works.push(...works);
  const dossier: Dossier = {
    profileId: profile.id,
    kind: profile.kind,
    sections: persona.dossier.map((s) => ({ ...s, sourceSegmentIds: remap(s.sourceSegmentIds), updatedAt: now })),
    workIds: works.map((w) => w.id),
    generatedAt: now,
  };
  db.dossiers.push(dossier);
  return { profile, segmentIds, works, copies };
}

/** The justification and panel files are an extra: if one is broken the scenario still loads (/demo reports it). */
function tryLoad<T>(what: string, load: () => T): T | undefined {
  try {
    return load();
  } catch (e) {
    console.warn(`[demo] ${what} not loaded:`, e instanceof Error ? e.message : e);
    return undefined;
  }
}

/** The demo organisation: fictional members who already accepted, each with a complete profile and a dossier (the panel only shows complete ones). */
function seedOrganization(db: Db, user: User, file: OrgFile): number {
  const now = nowIso();
  const org = { id: `org-${short()}`, name: file.org.name, kind: file.org.kind, ownerId: user.id, createdAt: now };
  db.organizations.push(org);
  file.members.forEach((m, i) => {
    const ownerId = demoMemberOwner(user.id, i);
    const profile = withCanonicalFields({ ...structuredClone(m.profile), id: `profile-${randomUUID()}`, ownerId, beneficiaryTypes: [], updatedAt: now });
    db.profiles.push(profile);
    db.dossiers.push({ profileId: profile.id, kind: profile.kind, sections: m.dossier.map((s) => ({ ...s, updatedAt: now })), workIds: [], generatedAt: now });
    const membership: OrgMembership = { id: `mem-${short()}`, orgId: org.id, email: m.email, status: "accepted", invitedAt: now, userId: ownerId, profileId: profile.id, acceptedAt: now };
    db.memberships.push(membership);
  });
  return file.members.length;
}

/** Invoices already assigned to the Pro application's budget lines: one line ends up overspent so /justificacion shows an alert. */
function seedInvoices(db: Db, app: Application, file: JustificationFile, copies: { from: string; to: string }[]): number {
  const now = nowIso();
  let n = 0;
  for (const i of file.invoices) {
    const line = app.budget.find((l) => l.concept === i.lineConcept);
    if (!line) continue; // the call lists no expense types and the file budget changed: nothing to assign to
    const id = `inv-${short()}`;
    copies.push({ from: invoiceImagePath(i.image), to: path.join(uploadsDir(), `${id}.png`) });
    const invoice: Invoice = {
      id,
      applicationId: app.id,
      profileId: app.profileId,
      imageUrl: `/api/justification/invoices/${id}/image`,
      supplier: i.supplier,
      taxId: i.taxId,
      number: i.number,
      date: i.date,
      concept: i.concept,
      baseEur: i.baseEur,
      vatEur: i.vatEur,
      totalEur: i.totalEur,
      expenseType: line.expenseType,
      lineConcept: line.concept,
      assignedBy: "ai",
      confidence: 0.95,
      extractedBy: "vision",
      createdAt: now,
    };
    db.invoices.push(invoice);
    n++;
  }
  return n;
}

/**
 * Deletes everything the user owns (profiles, transcripts, works and their photos, dossiers, designs, PDF exports,
 * applications, jury scores, usage, match and dossier-variant caches) and loads the scenario into the same account. Other users are never
 * touched. The RevenueCat app user id always rotates (fresh sandbox customer):
 * - blank / onboarded / business: no entitlement on the new id, so the paywall shows again;
 * - pro: the new id gets a demo Pro grant (DEMO_EMAILS only in production) and an application scored 61 → 84, with
 *   3 invoices already assigned and one budget line overspent (/justificacion, IDEA #7).
 * Every scenario also leaves the demo organisation with 3 members who already accepted (/panel, IDEA #8).
 */
export async function resetUserDemo(user: User, input: { scenario?: DemoScenarioId; withBusiness?: boolean } = {}): Promise<DemoResetResult> {
  const scenario = input.scenario ?? "blank";
  if (scenario === "pro" && !canGrantDemoPro(user)) {
    throw new ForbiddenError("El escenario Pro solo está disponible para las cuentas de demo (DEMO_EMAILS). Pide que añadan tu email o usa la compra de prueba.");
  }
  // Read and validate every file before deleting anything: a broken scenario must never leave the account empty.
  const artist = scenario === "onboarded" || scenario === "pro" || scenario === "business" ? loadArtist() : undefined;
  const business = scenario !== "blank" || input.withBusiness === true ? loadBusiness() : undefined;
  const proFile = scenario === "pro" ? loadPro() : undefined;
  const call: Call | undefined = proFile ? pickProCall(proFile, listCalls()) : undefined;
  if (proFile && !call) throw new Error("No hay ninguna convocatoria abierta para preparar la solicitud de ejemplo");

  const justification = proFile ? tryLoad("justification.json", loadJustification) : undefined;
  const orgFile = tryLoad("org.json", loadOrg);

  const done = await updateDb((db) => {
    const u = db.users.find((x) => x.id === user.id);
    if (!u) throw new Error("Usuario no encontrado");
    const profileIds = new Set(db.profiles.filter((p) => p.ownerId === user.id).map((p) => p.id));
    const workIds = db.works.filter((w) => profileIds.has(w.profileId)).map((w) => w.id);
    const appIds = new Set(db.applications.filter((a) => profileIds.has(a.profileId)).map((a) => a.id));
    const invoiceIds = db.invoices.filter((i) => appIds.has(i.applicationId)).map((i) => i.id);
    const oldAppUserId = u.appUserId;

    db.profiles = db.profiles.filter((p) => !profileIds.has(p.id));
    db.transcripts = db.transcripts.filter((t) => !profileIds.has(t.profileId));
    db.works = db.works.filter((w) => !profileIds.has(w.profileId));
    db.dossiers = db.dossiers.filter((d) => !profileIds.has(d.profileId));
    db.applications = db.applications.filter((a) => !appIds.has(a.id));
    db.juryScores = db.juryScores.filter((s) => !appIds.has(s.applicationId));
    db.invoices = db.invoices.filter((i) => !appIds.has(i.applicationId));
    db.justifications = db.justifications.filter((j) => !appIds.has(j.applicationId));
    db.usage = db.usage.filter((x) => x.appUserId !== oldAppUserId);
    db.entitlements = db.entitlements.filter((e) => e.appUserId !== oldAppUserId);
    db.matchCache = db.matchCache.filter((m) => !profileIds.has(m.profileId) && ![...profileIds].some((id) => m.cacheKey.startsWith(`${id}|`)));
    db.variantCache = db.variantCache.filter((v) => !v.profileId || !profileIds.has(v.profileId));
    removePanelData(db, u); // the organisation they run and the fictional members a previous scenario seeded

    u.appUserId = newAppUserId();
    const copies: Materialised["copies"] = [];
    let creator: Materialised | undefined;
    if (artist) {
      creator = materialise(db, user.id, artist);
      copies.push(...creator.copies);
    } else {
      const fresh = blankProfileFor(user.id, "creator");
      db.profiles.push(fresh);
    }
    const biz = business ? materialise(db, user.id, business) : undefined;
    if (biz) copies.push(...biz.copies);

    let applicationId: string | undefined;
    let invoices = 0;
    if (proFile && call && creator) {
      const now = nowIso();
      db.entitlements.push({ appUserId: u.appUserId, pro: true, premiumCredits: 0, activeProductId: DEMO_PRODUCT_ID, source: "mock", updatedAt: now });
      const ids = creator.segmentIds;
      const app: Application = {
        id: `app-${short()}`,
        profileId: creator.profile.id,
        callId: call.id,
        version: 1,
        status: "draft",
        sections: proFile.application.sections.map((s) => ({ ...s, sourceSegmentIds: s.sourceSegmentIds.map((id) => ids.get(id)).filter((x): x is string => Boolean(x)) })),
        // the example lines use the fixture's expense types: map them onto whatever the picked call allows (a call that
        // lists none keeps the example lines, so the justification demo always has a budget)
        budget: call.allowedExpenses.length
          ? proFile.application.budget.map((l) => ({ ...l, expenseType: call.allowedExpenses.includes(l.expenseType) ? l.expenseType : call.allowedExpenses[0] }))
          : structuredClone(proFile.application.budget),
        checklist: buildChecklist(call),
        createdAt: now,
        updatedAt: now,
      };
      db.applications.push(app);
      applicationId = app.id;
      if (justification) invoices = seedInvoices(db, app, justification, copies);
    }
    const panelMembers = orgFile ? seedOrganization(db, u, orgFile) : 0;

    const creatorId = db.profiles.find((p) => p.ownerId === user.id && p.kind === "creator")!.id;
    u.activeProfileId = scenario === "business" && biz ? biz.profile.id : creatorId;
    return { profileIds: [...profileIds], workIds, invoiceIds, appUserId: u.appUserId, activeProfileId: u.activeProfileId, applicationId, copies, invoices, panelMembers };
  });

  forgetDesigns(done.profileIds);
  await Promise.all([forgetProfileSearches(done.profileIds), forgetDeepResearch(done.profileIds)]);
  removeFiles(uploadsDir(), (f) => done.workIds.some((id) => f.startsWith(`${id}.`)) || done.invoiceIds.some((id) => f.startsWith(`${id}.`)) || done.profileIds.some((id) => f.startsWith(`dossier-import-${id}.`)));
  removeFiles(exportsDir(), (f) => done.profileIds.some((id) => f === `dossier-${id}.pdf` || f.startsWith(`dossier-${id}-`)));
  for (const c of done.copies) fs.copyFileSync(c.from, c.to);

  if (done.applicationId) {
    // The stage plan B: the jury of this account is deterministic (61 now, 84 after «Aplicar mejoras»), switchable in /demo.
    setDemoSettings(user.id, { deterministicJury: true });
    await runWithAiSwitches({ deterministicJury: true }, () => scoreApplication(done.applicationId!));
  }
  return {
    ok: true,
    scenario,
    appUserId: done.appUserId,
    activeProfileId: done.activeProfileId,
    pro: Boolean(done.applicationId),
    ...(done.applicationId ? { applicationId: done.applicationId, callId: call?.id, invoices: done.invoices } : {}),
    ...(done.panelMembers ? { panelMembers: done.panelMembers } : {}),
  };
}

function removeFiles(dir: string, match: (file: string) => boolean) {
  for (const f of fs.readdirSync(dir)) if (match(f)) fs.rmSync(path.join(dir, f), { force: true });
}

/** Admin CLI only: back to the initial database (every account and session is gone). */
export async function resetAllDemo(): Promise<void> {
  const inviteCodes = readDb().inviteCodes; // invite codes are admin configuration, not account data: they survive
  await resetDb({ ...initialDb(), inviteCodes });
  await Promise.all([forgetProfileSearches(), forgetDeepResearch()]);
}
