import { beforeEach, describe, expect, it } from "vitest";
import { POST as postApp } from "@/app/api/applications/route";
import { GET as getJury, POST as postJury } from "@/app/api/jury/route";
import { POST as postImprove } from "@/app/api/jury/improve/route";
import { POST as postUndo } from "@/app/api/jury/undo/route";
import { DEMO_APP_USER_ID, DEMO_CREATOR_ID } from "@/fixtures";
import { createUser, grantPro, loginDemo, req, seedOnboardedCreator } from "../helpers";

const CALL = "fixture-beca-artes-plasticas";

beforeEach(async () => {
  await loginDemo();
});

async function draft() {
  await seedOnboardedCreator();
  await grantPro();
  return (await (await postApp(req("/api/applications", { body: { callId: CALL, profileId: DEMO_CREATOR_ID, appUserId: DEMO_APP_USER_ID } }))).json()).application;
}

const lines = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l));

describe("jury API", () => {
  it("streams one event per judge, then the score; a second POST reuses it", async () => {
    const app = await draft();
    const res = await postJury(req("/api/jury", { body: { applicationId: app.id }, headers: { accept: "application/x-ndjson" } }));
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    const events = await lines(res);
    expect(events.filter((e) => e.type === "judge")).toHaveLength(3);
    const done = events.at(-1);
    expect(done.type).toBe("done");
    expect(done.score.total).toBe(61);
    const again = await (await postJury(req("/api/jury", { body: { applicationId: app.id } }))).json();
    expect(again.score.id).toBe(done.score.id);
    const forced = await (await postJury(req("/api/jury", { body: { applicationId: app.id, force: true } }))).json();
    expect(forced.score.id).not.toBe(done.score.id);
  });

  it("two-step improve (revise, then streamed re-score) and undo", async () => {
    const app = await draft();
    const s1 = (await (await postJury(req("/api/jury", { body: { applicationId: app.id } }))).json()).score;
    const revised = await (await postImprove(req("/api/jury/improve", { body: { applicationId: app.id, scoreId: s1.id, stage: "revise" } }))).json();
    expect(revised.application.version).toBe(2);
    expect(revised.alreadyRevised).toBe(false);
    // no score for v2 yet: the page re-scores with progress
    expect((await (await getJury(req(`/api/jury?applicationId=${app.id}`))).json()).score.applicationVersion).toBe(1);
    const done = (await lines(await postJury(req("/api/jury", { body: { applicationId: app.id }, headers: { accept: "application/x-ndjson" } })))).at(-1);
    expect(done.score.total).toBe(84);

    const undone = await (await postUndo(req("/api/jury/undo", { body: { applicationId: app.id } }))).json();
    expect(undone.score.total).toBe(61);
    expect(undone.application.sections).toEqual(app.sections);
    expect((await postUndo(req("/api/jury/undo", { body: { applicationId: app.id } }))).status).toBe(409);
  });

  it("empty fixes are refused with a Spanish message; over-long facts are a 400", async () => {
    const app = await draft();
    const s1 = (await (await postJury(req("/api/jury", { body: { applicationId: app.id } }))).json()).score;
    const empty = await postImprove(req("/api/jury/improve", { body: { applicationId: app.id, scoreId: s1.id, fixes: [] } }));
    expect(empty.status).toBe(409);
    expect((await empty.json()).message).toMatch(/Marca al menos una/);
    const long = await postImprove(req("/api/jury/improve", { body: { applicationId: app.id, scoreId: s1.id, facts: [{ fix: "x", text: "a".repeat(301) }] } }));
    expect(long.status).toBe(400);
  });

  it("another account cannot score, improve or undo my application", async () => {
    const app = await draft();
    const { cookie } = await createUser("otra@mecena.test");
    expect((await postJury(req("/api/jury", { body: { applicationId: app.id }, cookie }))).status).toBe(404);
    expect((await postImprove(req("/api/jury/improve", { body: { applicationId: app.id, scoreId: "x" }, cookie }))).status).toBe(404);
    expect((await postUndo(req("/api/jury/undo", { body: { applicationId: app.id }, cookie }))).status).toBe(404);
  });
});
