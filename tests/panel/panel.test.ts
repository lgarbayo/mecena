/**
 * B2B panel: consent (nothing visible before the invitee accepts), isolation between accounts, the aggregate, the
 * marked demo organisation and account deletion.
 */
import { describe, expect, it } from "vitest";
import { GET as panelGet, POST as panelPost } from "@/app/api/panel/route";
import { GET as invGet, POST as invPost } from "@/app/api/panel/invitations/route";
import { DELETE as memDelete, PATCH as memPatch } from "@/app/api/panel/memberships/[id]/route";
import { deleteAccount } from "@/features/account/service";
import { demoPanel, panelFor, panelOrDemo } from "@/features/panel/service";
import { nowIso, readDb, saveDossier } from "@/server/store";
import { DEMO_CREATOR_ID } from "@/fixtures";
import { ctx, createUser, DEMO_EMAIL, loginDemo, req, seedOnboardedCreator } from "../helpers";

const NOW = new Date("2026-11-14T10:00:00Z");

/** Org owner "Escuela" + the onboarded demo creator as an invited (not yet accepted) member. */
async function setup() {
  const member = await loginDemo();
  await seedOnboardedCreator();
  await saveDossier({ profileId: DEMO_CREATOR_ID, kind: "creator", sections: [], workIds: [], generatedAt: nowIso() });
  const owner = await createUser("escuela@example.org");
  const created = await panelPost(req("/api/panel", { body: { name: "Escola de Arte", kind: "school" }, cookie: owner.cookie }));
  expect(created.status).toBe(201);
  const invited = await invPost(req("/api/panel/invitations", { body: { email: ` ${DEMO_EMAIL.toUpperCase()} ` }, cookie: owner.cookie }));
  expect(invited.status).toBe(201);
  const { id } = (await invited.json()) as { id: string };
  return { member, owner, id };
}

describe("B2B panel", () => {
  it("shows the marked demo organisation to a user without one, built from the demo scenarios", async () => {
    const { user } = await createUser("sola@example.com");
    const p = panelOrDemo(user, { now: NOW });
    expect(p.demo).toBe(true);
    expect(p.org.name).toMatch(/demo/i);
    expect(p.members.map((m) => m.displayName)).toEqual(expect.arrayContaining(["Antía Varela"]));
    expect(p.summary.members).toBe(p.members.length);
    expect(readDb().profiles.some((x) => x.ownerId === "demo")).toBe(false); // never stored
    const res = await panelGet(req("/api/panel", { cookie: (await createUser("otra@example.com")).cookie }));
    expect(((await res.json()) as { demo: boolean }).demo).toBe(true);
  });

  it("demo members only list open, eligible calls and the aggregate adds up", () => {
    const p = demoPanel(NOW);
    for (const m of p.members) {
      for (const c of m.matches) expect(c.daysLeft === null || c.daysLeft >= 0).toBe(true);
      const dated = m.matches.filter((c) => c.deadline).map((c) => c.deadline!);
      expect(m.nextDeadline?.deadline ?? null).toBe(dated.sort()[0] ?? null);
    }
    const distinct = new Set(p.members.flatMap((m) => m.matches.map((c) => c.callId)));
    expect(p.summary.openCallsWithFit).toBe(distinct.size);
    expect(p.summary.membersWithMatches).toBe(p.members.filter((m) => m.matches.length > 0).length);
    const dl = p.summary.upcomingDeadlines.map((d) => d.deadline!);
    expect(dl).toEqual([...dl].sort());
    expect(dl.length).toBeLessThanOrEqual(5);
  });

  it("sees nothing of an invited person until they accept", async () => {
    const { owner, user } = await setup().then((s) => ({ owner: s.owner.user, user: s.member.user }));
    const before = panelFor(owner, NOW)!;
    expect(before.demo).toBe(false);
    expect(before.members).toEqual([]);
    expect(before.summary).toMatchObject({ members: 0, pendingInvitations: 1, incompleteMembers: 0 });
    expect(JSON.stringify(before)).not.toContain(user.id);
  });

  it("after accepting, the owner sees the member's matches; only the invitee can accept; declining removes the record", async () => {
    const { owner, member, id } = await setup();
    const stranger = await createUser("curiosa@example.com");
    // someone else's id looks like it does not exist
    expect((await memPatch(req(`/api/panel/memberships/${id}`, { method: "PATCH", body: {}, cookie: stranger.cookie }), ctx({ id }))).status).toBe(404);
    expect((await memPatch(req(`/api/panel/memberships/${id}`, { method: "PATCH", body: {}, cookie: owner.cookie }), ctx({ id }))).status).toBe(404);
    expect((await memDelete(req(`/api/panel/memberships/${id}`, { method: "DELETE", body: {}, cookie: stranger.cookie }), ctx({ id }))).status).toBe(404);
    expect(readDb().memberships).toHaveLength(1);

    const mine = (await (await invGet(req("/api/panel/invitations", { cookie: member.cookie }))).json()) as { invited: { id: string; orgName: string }[] };
    expect(mine.invited).toMatchObject([{ id, orgName: "Escola de Arte" }]);
    expect(((await (await invGet(req("/api/panel/invitations", { cookie: stranger.cookie }))).json()) as { invited: unknown[] }).invited).toEqual([]);

    expect((await memPatch(req(`/api/panel/memberships/${id}`, { method: "PATCH", body: {}, cookie: member.cookie }), ctx({ id }))).status).toBe(200);
    expect(readDb().memberships[0]).toMatchObject({ status: "accepted", userId: member.user.id, profileId: DEMO_CREATOR_ID });

    const p = panelFor(owner.user, NOW)!;
    expect(p.summary.members).toBe(1);
    expect(p.members[0]!.displayName).toBeTruthy();
    expect(Object.keys(p.members[0]!).sort()).toEqual(["disciplines", "displayName", "id", "kind", "matches", "nextDeadline"].concat(p.members[0]!.location ? ["location"] : []).sort());
    expect(JSON.stringify(p)).not.toMatch(/transcript|statement|dossier/i);

    // the member leaves: the owner sees nothing again
    expect((await memDelete(req(`/api/panel/memberships/${id}`, { method: "DELETE", body: {}, cookie: member.cookie }), ctx({ id }))).status).toBe(200);
    expect(panelFor(owner.user, NOW)!.summary).toMatchObject({ members: 0, pendingInvitations: 0 });
  });

  it("a member that has not finished their profile or dossier is counted, never shown", async () => {
    const owner = await createUser("escuela2@example.org");
    await panelPost(req("/api/panel", { body: { name: "Asociación", kind: "association" }, cookie: owner.cookie }));
    const blank = await createUser("nueva@example.com");
    const res = await invPost(req("/api/panel/invitations", { body: { email: "nueva@example.com" }, cookie: owner.cookie }));
    const { id } = (await res.json()) as { id: string };
    await memPatch(req(`/api/panel/memberships/${id}`, { method: "PATCH", body: {}, cookie: blank.cookie }), ctx({ id }));
    const p = panelFor(owner.user, NOW)!;
    expect(p.members).toEqual([]);
    expect(p.summary.incompleteMembers).toBe(1);
  });

  it("an accepted member cannot share a profile that is not theirs", async () => {
    const { owner, member, id } = await setup();
    const other = await createUser("ajena@example.com");
    const otherProfile = other.user.activeProfileId;
    const res = await memPatch(req(`/api/panel/memberships/${id}`, { method: "PATCH", body: { profileId: otherProfile }, cookie: member.cookie }), ctx({ id }));
    expect(res.status).toBe(404);
    expect(readDb().memberships[0]!.status).toBe("invited");
    expect(owner.user.id).not.toBe(member.user.id);
  });

  it("rejects duplicate invitations, inviting without an organisation, and a second organisation", async () => {
    const { owner } = await setup();
    const dup = await invPost(req("/api/panel/invitations", { body: { email: DEMO_EMAIL }, cookie: owner.cookie }));
    expect(dup.status).toBe(409);
    const again = await panelPost(req("/api/panel", { body: { name: "Otra" }, cookie: owner.cookie }));
    expect(again.status).toBe(409);
    const nobody = await createUser("sin-org@example.com");
    expect((await invPost(req("/api/panel/invitations", { body: { email: "x@example.com" }, cookie: nobody.cookie }))).status).toBe(404);
    expect((await invPost(req("/api/panel/invitations", { body: { email: "no-es-un-correo" }, cookie: owner.cookie }))).status).toBe(400);
  });

  it("requires a session", async () => {
    expect((await panelGet(req("/api/panel", { cookie: null }))).status).toBe(401);
    expect((await invGet(req("/api/panel/invitations", { cookie: null }))).status).toBe(401);
  });

  it("deleting an account removes the organisations it runs and every membership of it", async () => {
    const { owner, member } = await setup();
    await memPatch(req(`/api/panel/memberships/${readDb().memberships[0]!.id}`, { method: "PATCH", body: {}, cookie: member.cookie }), ctx({ id: readDb().memberships[0]!.id }));
    await deleteAccount(member.user);
    expect(readDb().memberships).toEqual([]); // the member's own consent record is gone
    expect(readDb().organizations).toHaveLength(1);
    await deleteAccount(owner.user);
    expect(readDb().organizations).toEqual([]);
  });
});
