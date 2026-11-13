import fs from "node:fs";
import path from "node:path";
import { GET as getCall } from "@/app/api/calls/[id]/route";
import type { PastAward } from "@/contracts";
import { summarizeHistory, type BdnsAward } from "@/features/history/history";
import { DEMO_CREATOR_ID } from "@/fixtures";
import { ctx, req, seedOnboardedCreator } from "../helpers";

const CALL = "fixture-beca-artes-plasticas";
const award = (id: number, beneficiario: string): BdnsAward => ({ codConcesion: String(id), idPersona: id, importe: 1000, beneficiario, fechaConcesion: "2025-10-01" });

function writeCallsFile(name: string, data: unknown) {
  fs.writeFileSync(path.join(process.env.MECENA_CALLS_DIR!, name), JSON.stringify(data));
}

const pastAward = (id: string, kind: PastAward["beneficiaryKind"]): PastAward => ({
  id,
  callId: CALL,
  callTitle: "Edición 2025",
  organizer: "Organismo",
  year: 2025,
  beneficiary: `Ganador ${id}`,
  beneficiaryKind: kind,
  sourceUrl: "https://example.org/bdns",
});

describe("GET /api/calls/[id] with B3 history", () => {
  it("returns the call history, the share of winners like the profile, and same-kind similar awards", async () => {
    await seedOnboardedCreator();
    const history = summarizeHistory({
      callId: CALL,
      bdnsId: "1",
      builtAt: "2026-11-13",
      editions: [{ bdnsId: "a", date: "2025-03-01", title: "Edición 2025", awards: [award(1, "***1234** A"), award(2, "***5678** B"), award(3, "B12345678 PRODUCTORA, S.L.")] }],
      resolutions: [{ bdnsId: "a", applicants: 30, awarded: 3, cutoffScore: 61.5, maxScore: 75, sourceUrl: "https://example.org/resolucion" }],
    });
    writeCallsFile("history.json", { [CALL]: history });
    writeCallsFile("awards.json", [pastAward("p1", "business"), pastAward("p2", "creator")]);

    const body = await (await getCall(req(`/api/calls/${CALL}?profileId=${DEMO_CREATOR_ID}`), ctx({ id: CALL }))).json();
    expect(body.history.successRate).toEqual({ awarded: 3, applicants: 30, rate: 0.1, bdnsId: "a" });
    expect(body.history.cutoff.score).toBe(61.5);
    expect(body.winnerShare).toEqual({ compatible: 2, total: 3, share: 2 / 3 }); // creator ⇒ persona-fisica ⇒ natural-person winners
    expect(body.similarAwards.map((a: PastAward) => a.id)).toEqual(["p2"]); // no companies for a creator
  });

  it("history and winnerShare are null when there is no history file", async () => {
    await seedOnboardedCreator();
    const body = await (await getCall(req(`/api/calls/${CALL}?profileId=${DEMO_CREATOR_ID}`), ctx({ id: CALL }))).json();
    expect(body.history).toBeNull();
    expect(body.winnerShare).toBeNull();
  });
});
