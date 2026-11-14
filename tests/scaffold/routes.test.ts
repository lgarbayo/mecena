import { describe, expect, it, beforeEach } from "vitest";
import { GET as getProfile } from "@/app/api/profile/route";
import { GET as getCalls } from "@/app/api/calls/route";
import { POST as createApplication } from "@/app/api/applications/route";
import { POST as resetDemo } from "@/app/api/demo/reset/route";
import { DEMO_APP_USER_ID } from "@/fixtures";
import { req, loginDemo } from "../helpers";

// Route handlers need a session: run as the demo account (owns the fixture profiles).
beforeEach(async () => {
  await loginDemo();
});

describe("API routes (scaffold)", () => {
  it("GET /api/profile returns the active profile and app user id", async () => {
    const r = await getProfile(req("/api/profile"));
    expect(r.status).toBe(200);
    expect((await r.json()).appUserId).toBe(DEMO_APP_USER_ID);
  });

  it("GET /api/calls returns the feed for the active mode", async () => {
    const body = await (await getCalls(req("/api/calls"))).json();
    expect(body.mode).toBe("creator");
  });

  it("POST /api/applications without entitlement is 402 payment_required", async () => {
    const r = await createApplication(req("/api/applications", { body: { callId: "fixture-beca-artes-plasticas", appUserId: DEMO_APP_USER_ID } }));
    expect(r.status).toBe(402);
    expect((await r.json()).error).toBe("payment_required");
  });

  it("POST /api/demo/reset rotates the app user id", async () => {
    const body = await (await resetDemo(req("/api/demo/reset", { body: {} }))).json();
    expect(body.appUserId).not.toBe(DEMO_APP_USER_ID);
  });
});
