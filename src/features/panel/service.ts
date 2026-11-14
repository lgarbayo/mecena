/**
 * B2B panel (IDEA #8): a school or association follows several creators at once. Server-only.
 *
 * Consent model: an organisation invites an email address; nothing is visible until the person signs in with that email
 * and accepts, choosing which of their profiles to share. Either side can end it (the record is deleted). What the
 * organisation sees is a projection: name, discipline, place, matched open calls and their deadlines. Never the
 * dossier, works, transcript or applications.
 *
 * Matching is the existing deterministic service (rankCallsFor); this module only aggregates. Without members the
 * panel shows a clearly marked demo organisation built from the demo scenario personas (data/demo), never stored.
 */
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  type Call,
  type Organization,
  type OrgMembership,
  type Profile,
  type ProfileKind,
  type User,
} from "@/contracts";
import { daysLeft, fitLabel, profileSummary, rankCallsFor, type FitLabel } from "@/features/matching/service";
import { disciplineLabel, isDisciplineId } from "@/features/normalize";
import { normalizeEmail, ownedProfile } from "@/server/auth";
import { getDossier, listWorks, newId, nowIso, readDb, updateDb, withCanonicalFields } from "@/server/store";
import { loadArtist, loadBusiness, type PersonaFile } from "@/features/demo/scenarios";

export const MAX_MEMBERS_PER_ORG = 50;

// ---------- views ----------
export interface PanelCall {
  callId: string;
  title: string;
  organizer: string;
  amountText: string;
  deadline: string | null;
  deadlineText: string;
  daysLeft: number | null;
  score: number;
  fit: FitLabel;
}

export interface PanelMember {
  id: string; // membership id (demo: "demo-…")
  displayName: string;
  kind: ProfileKind;
  disciplines: string[]; // labels
  location?: string;
  /** Open calls this member fits, best first. */
  matches: PanelCall[];
  /** The soonest deadline among them (rolling calls without a date do not count). */
  nextDeadline: PanelCall | null;
}

export interface PanelDeadline extends PanelCall {
  memberNames: string[];
}

export interface PanelSummary {
  members: number; // accepted and ready (profile and dossier completed)
  membersWithMatches: number;
  openCallsWithFit: number; // distinct open calls that fit at least one member
  /** Accepted members whose profile is not complete yet: counted, never shown. */
  incompleteMembers: number;
  pendingInvitations: number;
  upcomingDeadlines: PanelDeadline[]; // soonest first, max 5
}

export interface PanelInvitation {
  id: string;
  email: string;
  invitedAt: string;
}

export interface Panel {
  demo: boolean;
  org: { id: string; name: string; kind: Organization["kind"] };
  members: PanelMember[];
  summary: PanelSummary;
  invitations: PanelInvitation[]; // pending ones, owner only
}

export interface MyInvitations {
  invited: { id: string; orgName: string; orgKind: Organization["kind"]; invitedAt: string }[];
  /** Organisations that currently see this account's shared profile. */
  accepted: { id: string; orgName: string; orgKind: Organization["kind"]; profileId: string; acceptedAt: string }[];
}

// ---------- organisations and memberships ----------
export const orgOwnedBy = (userId: string): Organization | undefined => readDb().organizations.find((o) => o.ownerId === userId);

export async function createOrganization(user: User, input: { name: string; kind: Organization["kind"] }): Promise<Organization> {
  return updateDb((db) => {
    if (db.organizations.some((o) => o.ownerId === user.id)) throw new ConflictError("Ya tienes una organización.");
    const org: Organization = { id: newId("org"), name: input.name, kind: input.kind, ownerId: user.id, createdAt: nowIso() };
    db.organizations.push(org);
    return org;
  });
}

/** Owner only. Invites an email; the person sees it when they sign in with that address. */
export async function inviteMember(user: User, emailRaw: string): Promise<OrgMembership> {
  const email = normalizeEmail(emailRaw);
  return updateDb((db) => {
    const org = db.organizations.find((o) => o.ownerId === user.id);
    if (!org) throw new NotFoundError("Primero crea tu organización.");
    const mine = db.memberships.filter((m) => m.orgId === org.id);
    if (mine.some((m) => m.email === email)) throw new ConflictError("Ya has invitado a esa dirección.");
    if (mine.length >= MAX_MEMBERS_PER_ORG) throw new BadRequestError(`Una organización admite hasta ${MAX_MEMBERS_PER_ORG} miembros.`);
    const m: OrgMembership = { id: newId("mem"), orgId: org.id, email, status: "invited", invitedAt: nowIso() };
    db.memberships.push(m);
    return m;
  });
}

/** The invitee accepts, consenting to share one of their own profiles. Only the account with that email can. */
export async function acceptInvitation(user: User, membershipId: string, profileId?: string): Promise<OrgMembership> {
  const profile = ownedProfile(user.id, profileId ?? user.activeProfileId);
  return updateDb((db) => {
    const m = db.memberships.find((x) => x.id === membershipId && x.email === normalizeEmail(user.email));
    if (!m) throw new NotFoundError("No encuentro esa invitación.");
    if (m.status === "accepted") throw new ConflictError("Ya la has aceptado.");
    Object.assign(m, { status: "accepted", userId: user.id, profileId: profile.id, acceptedAt: nowIso() });
    return { ...m };
  });
}

/**
 * Ends a membership or an invitation. Allowed to the organisation's owner (remove / withdraw) and to the invitee
 * (decline / leave). Anyone else gets a 404, so ids do not leak.
 */
export async function endMembership(user: User, membershipId: string): Promise<void> {
  await updateDb((db) => {
    const m = db.memberships.find((x) => x.id === membershipId);
    const org = m && db.organizations.find((o) => o.id === m.orgId);
    const isOwner = org?.ownerId === user.id;
    const isInvitee = m && (m.userId === user.id || m.email === normalizeEmail(user.email));
    if (!m || !(isOwner || isInvitee)) throw new NotFoundError("No encuentro esa invitación.");
    db.memberships = db.memberships.filter((x) => x.id !== membershipId);
  });
}

export function myInvitations(user: User): MyInvitations {
  const db = readDb();
  const email = normalizeEmail(user.email);
  const org = (id: string) => db.organizations.find((o) => o.id === id);
  const out: MyInvitations = { invited: [], accepted: [] };
  for (const m of db.memberships) {
    const o = org(m.orgId);
    if (!o) continue;
    if (m.status === "invited" && m.email === email) out.invited.push({ id: m.id, orgName: o.name, orgKind: o.kind, invitedAt: m.invitedAt });
    if (m.status === "accepted" && m.userId === user.id && m.profileId) {
      out.accepted.push({ id: m.id, orgName: o.name, orgKind: o.kind, profileId: m.profileId, acceptedAt: m.acceptedAt ?? m.invitedAt });
    }
  }
  return out;
}

// ---------- the panel ----------
const toPanelCall = (call: Call, score: number, now: Date): PanelCall => ({
  callId: call.id,
  title: call.title,
  organizer: call.organizer,
  amountText: call.amountText,
  deadline: call.deadline,
  deadlineText: call.deadlineText,
  daysLeft: daysLeft(call, now) ?? null,
  score,
  fit: fitLabel(score),
});

/** Open calls (not upcoming, not a closed edition, deadline not passed) that the rules say this profile can apply for. */
function openMatches(profile: Profile, ctx: { hasDossier: boolean; worksCount: number }, now: Date): PanelCall[] {
  const { results } = rankCallsFor(profile, { ...ctx, now }, { limit: 500 });
  return results
    .filter((r) => r.call.status === "open" && r.match.eligible)
    .filter((r) => r.call.deadline === null || (daysLeft(r.call, now) ?? 0) >= 0)
    .map((r) => toPanelCall(r.call, r.match.score, now));
}

const byDeadline = (a: PanelCall, b: PanelCall) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");

function memberView(id: string, profile: Profile, matches: PanelCall[]): PanelMember {
  const s = profileSummary(profile);
  return {
    id,
    displayName: profile.displayName || "Sin nombre",
    kind: profile.kind,
    disciplines: profile.disciplines.map((d) => (isDisciplineId(d) ? disciplineLabel(d) : d)),
    ...(s.location ? { location: s.location } : {}),
    matches,
    nextDeadline: [...matches].filter((m) => m.deadline).sort(byDeadline)[0] ?? null,
  };
}

function summarise(members: PanelMember[], extra: { incompleteMembers: number; pendingInvitations: number }): PanelSummary {
  const byCall = new Map<string, PanelDeadline>();
  for (const m of members) {
    for (const c of m.matches) {
      const prev = byCall.get(c.callId);
      if (prev) prev.memberNames.push(m.displayName);
      else byCall.set(c.callId, { ...c, memberNames: [m.displayName] });
    }
  }
  return {
    members: members.length,
    membersWithMatches: members.filter((m) => m.matches.length > 0).length,
    openCallsWithFit: byCall.size,
    ...extra,
    upcomingDeadlines: [...byCall.values()].filter((c) => c.deadline).sort(byDeadline).slice(0, 5),
  };
}

/** The owner's panel: accepted members whose shared profile and dossier are complete. */
export function panelFor(user: User, now: Date = new Date()): Panel | undefined {
  const org = orgOwnedBy(user.id);
  if (!org) return undefined;
  const memberships = readDb().memberships.filter((m) => m.orgId === org.id);
  const members: PanelMember[] = [];
  let incomplete = 0;
  for (const m of memberships.filter((x) => x.status === "accepted")) {
    const profile = m.profileId && m.userId ? readDb().profiles.find((p) => p.id === m.profileId && p.ownerId === m.userId) : undefined;
    // Complete = the profile says what and where, and the dossier exists. Anything less is counted, not shown.
    if (!profile || !profileSummary(profile).isComplete || !getDossier(profile.id)) {
      incomplete++;
      continue;
    }
    members.push(memberView(m.id, profile, openMatches(profile, { hasDossier: true, worksCount: listWorks(profile.id).length }, now)));
  }
  const invitations = memberships.filter((m) => m.status === "invited").map((m) => ({ id: m.id, email: m.email, invitedAt: m.invitedAt }));
  return {
    demo: false,
    org: { id: org.id, name: org.name, kind: org.kind },
    members,
    summary: summarise(members, { incompleteMembers: incomplete, pendingInvitations: invitations.length }),
    invitations,
  };
}

/**
 * The demo organisation: the demo scenario personas (data/demo/*.json) as members, matched live against the real
 * catalogue. Nobody's data: it is built in memory from the scenario files and flagged `demo: true`.
 */
export function demoPanel(now: Date = new Date()): Panel {
  const personas: [string, PersonaFile][] = [
    ["demo-artista", loadArtist()],
    ["demo-pyme", loadBusiness()],
  ];
  const members = personas.map(([id, persona]) => {
    const profile: Profile = withCanonicalFields({ ...structuredClone(persona.profile), id, ownerId: "demo", beneficiaryTypes: [], updatedAt: now.toISOString() });
    return memberView(id, profile, openMatches(profile, { hasDossier: true, worksCount: persona.works.length }, now));
  });
  return {
    demo: true,
    org: { id: "demo-org", name: "Escuela de Artes (demo)", kind: "school" },
    members,
    summary: summarise(members, { incompleteMembers: 0, pendingInvitations: 0 }),
    invitations: [],
  };
}

/** What the page shows: the user's own panel, or the demo one when they have no organisation (or ask for it). */
export function panelOrDemo(user: User, opts: { demo?: boolean; now?: Date } = {}): Panel & { hasOrg: boolean } {
  const own = opts.demo ? undefined : panelFor(user, opts.now);
  return own ? { ...own, hasOrg: true } : { ...demoPanel(opts.now), hasOrg: Boolean(orgOwnedBy(user.id)) };
}

/** Membership records that touch this account, for account deletion (see features/account). */
export function removePanelData(db: { organizations: Organization[]; memberships: OrgMembership[] }, user: { id: string; email?: string }) {
  const owned = new Set(db.organizations.filter((o) => o.ownerId === user.id).map((o) => o.id));
  const email = user.email ? normalizeEmail(user.email) : undefined;
  db.organizations = db.organizations.filter((o) => !owned.has(o.id));
  db.memberships = db.memberships.filter((m) => !owned.has(m.orgId) && m.userId !== user.id && !(email && m.email === email));
}
