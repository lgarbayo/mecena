import { bdnsToCallPatch, normalizeBdnsRecord, normalizeCall } from "@/features/normalize";
import records from "./fixtures/bdns-records.json";
import { makeCall } from "./helpers";

const rec = (id: string) => (records as { codigoBDNS: string }[]).find((r) => r.codigoBDNS === id)!;

describe("normalizeBdnsRecord on real BDNS records (fetched 2026-11-13)", () => {
  it("every record normalises without throwing and has at least one territory", () => {
    for (const r of records) {
      const { value } = normalizeBdnsRecord(r);
      expect(value.territories.length).toBeGreaterThan(0);
      expect(value.bdnsId).toMatch(/^\d+$/);
    }
  });

  it("910245 Elgoibar: Gipuzkoa, persona física + entidades, 30 días hábiles from the BOG", () => {
    const { value, warnings } = normalizeBdnsRecord(rec("910245"));
    expect(value.territories).toEqual(["ES212"]);
    expect(value.beneficiaryTypes).toEqual(["persona-fisica", "entidad-sin-animo-lucro", "entidad-publica"]);
    expect(value.sectors).toEqual([{ section: "S", code: "90" }]);
    expect(value.publicationDate).toBe("2026-06-16");
    expect(value.deadline).toMatchObject({ date: "2026-07-28", estimated: true, method: "business-days" });
    expect(value.amount).toEqual({ totalCents: 1_000_000 });
    expect(warnings.map((w) => w.code)).toEqual(["estimated-deadline"]);
  });

  it("906056 Cataluña: explicit fechaFinSolicitud, disciplines from the title", () => {
    const { value } = normalizeBdnsRecord(rec("906056"));
    expect(value.territories).toEqual(["ES51"]);
    expect(value.deadline).toEqual({ date: "2026-06-18", estimated: false, method: "explicit-field" });
    expect(value.disciplines.sort()).toEqual(["artes-escenicas", "artes-visuales", "musica"]);
  });

  it("state-wide, world-wide and Galician province regions", () => {
    expect(normalizeBdnsRecord(rec("939992")).value.territories).toEqual(["ES"]);
    expect(normalizeBdnsRecord(rec("921101")).value.territories).toEqual(["WORLD"]);
    expect(normalizeBdnsRecord(rec("933595")).value.territories).toEqual(["ES114"]);
  });

  it("flags suspicious and missing deadlines instead of guessing", () => {
    expect(normalizeBdnsRecord(rec("941218")).warnings.map((w) => w.code)).toContain("deadline-before-publication");
    const comm = normalizeBdnsRecord(rec("933595"));
    expect(comm.value.deadline.date).toBeNull();
    expect(comm.warnings.map((w) => w.code)).toContain("missing-deadline");
    expect(normalizeBdnsRecord(rec("941113")).value.deadline.method).toBe("rolling");
  });

  it("pyme digitalisation call (Castilla-La Mancha) maps to autónomo + pyme", () => {
    const { value } = normalizeBdnsRecord(rec("941478"));
    expect(value.beneficiaryTypes).toEqual(["autonomo", "pyme"]);
    expect(value.territories).toEqual(["ES42"]);
    expect(value.sectors.length).toBeGreaterThan(10);
  });
});

describe("bdnsToCallPatch round-trips through normalizeCall", () => {
  it("territory, beneficiaries, disciplines, amounts and deadline survive the current Call contract", () => {
    for (const r of records) {
      const patch = bdnsToCallPatch(r);
      const n = normalizeBdnsRecord(r).value;
      const call = makeCall({ ...patch, id: `bdns-${patch.bdnsId}`, deadline: patch.deadline, eligibility: patch.eligibility });
      const { value, warnings } = normalizeCall(call);
      expect(value.territories.sort()).toEqual(n.territories.includes("WORLD") ? ["ES"] : [...n.territories].sort());
      if (n.beneficiaryTypes.length) expect(value.beneficiaryTypes).toEqual(n.beneficiaryTypes);
      expect(value.disciplines).toEqual(n.disciplines);
      expect(value.amount).toEqual(n.amount);
      expect(value.deadline.date).toBe(n.deadline.date);
      expect(warnings.filter((w) => w.code.startsWith("unmapped"))).toEqual([]);
    }
  });

  it("writes human Spanish for amount and estimated deadlines", () => {
    const p = bdnsToCallPatch(rec("910245"));
    expect(p.amountText).toBe("Presupuesto total: 10.000 €");
    expect(p.deadlineText).toMatch(/^Estimado: 30 días hábiles/);
    expect(p.eligibility.residence).toEqual(["Gipuzkoa"]);
    expect(p.beneficiaryKinds).toEqual(["creator", "business"]);
    expect(bdnsToCallPatch(rec("907147")).beneficiaryKinds).toEqual(["creator"]);
  });
});
