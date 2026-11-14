import { describe, expect, it } from "vitest";
import type { Call } from "@/contracts";
import { withLiveStatus } from "@/server/store";

const call = (p: Partial<Call>) => ({ id: "x", status: "upcoming", opensAt: "2026-11-17", ...p }) as Call;

describe("withLiveStatus", () => {
  it("stays upcoming until the opening day in Spain", () => {
    expect(withLiveStatus(call({}), new Date("2026-11-16T22:30:00Z")).status).toBe("upcoming"); // 23:30 in Madrid
  });

  it("is open from the opening day in Spain", () => {
    expect(withLiveStatus(call({}), new Date("2026-11-16T23:30:00Z")).status).toBe("open"); // 00:30 on the 17th
    expect(withLiveStatus(call({}), new Date("2026-12-01T12:00:00Z")).status).toBe("open");
  });

  it("leaves other statuses and undated upcoming calls alone", () => {
    const now = new Date("2027-01-01T12:00:00Z");
    expect(withLiveStatus(call({ status: "recurring" }), now).status).toBe("recurring");
    expect(withLiveStatus(call({ opensAt: undefined }), now).status).toBe("upcoming");
  });
});
